
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AbsensiSiswa, Guru, Jadwal, Kurikulum, Siswa } from '@/lib/data';
import { useFirestore, useUser, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { format, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

const HARI_MAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const KELAS_OPTIONS = ['0', '1', '2', '3', '4', '5', '6'];
const STATUS_OPTIONS: AbsensiSiswa['status'][] = ['Hadir', 'Izin', 'Sakit', 'Alpha'];

export default function AbsenSiswa() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [isStaticDataLoading, setIsStaticDataLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKelas, setSelectedKelas] = useState('1');
  const [selectedJadwalId, setSelectedJadwalId] = useState<string | null>(null);
  const [reportMonth, setReportMonth] = useState(format(new Date(), 'yyyy-MM'));

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  useEffect(() => {
      if (!firestore || !user) return;
      
      const fetchData = async () => {
          setIsStaticDataLoading(true);
          try {
              const kurikulumQuery = collection(firestore, 'kurikulum');
              const guruQuery = collection(firestore, 'gurus');
              const [kurikulumSnap, guruSnap] = await Promise.all([getDocs(kurikulumQuery), getDocs(guruQuery)]);
              setKurikulum(kurikulumSnap.docs.map(d => ({ id: d.id, ...d.data() } as Kurikulum)));
              setTeachers(guruSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guru)));
          } catch (error) {
              console.error("Failed to fetch prerequisite data for AbsenSiswa", error);
              toast({ variant: 'destructive', title: "Gagal memuat data pendukung." });
          } finally {
              setIsStaticDataLoading(false);
          }
      };
      fetchData();
  }, [firestore, user]);

  const jadwalQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(
          collection(firestore, 'jadwal'),
          where('hari', '==', dayName),
          where('kelas', '==', selectedKelas)
      );
  }, [firestore, user, dayName, selectedKelas]);
  const { data: jadwal, isLoading: isJadwalLoading } = useCollection<Jadwal>(jadwalQuery);

  const siswaQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'siswa'),
      where('status', '==', 'Aktif'),
      where('kelas', '==', Number(selectedKelas))
    );
  }, [firestore, user, selectedKelas]);
  const { data: students, isLoading: isSiswaLoading } = useCollection<Siswa>(siswaQuery);

  const absensiQuery = useMemoFirebase(() => {
    if (!firestore || !selectedJadwalId) return null;
    return query(
      collection(firestore, 'absensiSiswa'), 
      where('tanggal', '==', todayString),
      where('jadwalId', '==', selectedJadwalId)
    );
  }, [firestore, todayString, selectedJadwalId]);
  const { data: absensiSiswa, isLoading: isAbsensiLoading } = useCollection<AbsensiSiswa>(absensiQuery);

  useEffect(() => {
    setSelectedJadwalId(null);
  }, [dayName, selectedKelas]);

  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k.mataPelajaran])), [kurikulum]);
  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const absensiSiswaMap = useMemo(() => new Map((absensiSiswa || []).map(a => [a.siswaId, a])), [absensiSiswa]);

  const sortedStudents = useMemo(() => [...(students || [])].sort((a,b) => a.nama.localeCompare(b.nama)), [students]);
  
  const isLoading = isStaticDataLoading || isJadwalLoading || isSiswaLoading || (selectedJadwalId && isAbsensiLoading);

  const handleStatusChange = (siswaId: string, status: AbsensiSiswa['status']) => {
    if (!firestore || !isAdmin || !selectedJadwalId) return;

    const existingAbsensi = absensiSiswaMap.get(siswaId);
    const docId = existingAbsensi ? existingAbsensi.id : `${selectedJadwalId}_${siswaId}_${todayString}`;
    const absensiRef = doc(firestore, 'absensiSiswa', docId);

    const absensiData: Omit<AbsensiSiswa, 'id'> = {
        jadwalId: selectedJadwalId,
        siswaId: siswaId,
        tanggal: todayString,
        status: status,
        keterangan: '',
        kelas: Number(selectedKelas), // Add class number for efficient querying
    };

    setDocumentNonBlocking(absensiRef, absensiData, { merge: true });
    toast({ title: 'Absensi diperbarui' });
  };

   const handleExportSiswaPdf = async () => {
    if (!firestore || !students || students.length === 0) {
        toast({ variant: 'destructive', title: "Tidak Ada Data", description: "Tidak ada siswa di kelas ini untuk dilaporkan." });
        return;
    }

    toast({ title: "Mempersiapkan Laporan...", description: "Mohon tunggu sebentar." });

    try {
        const { default: jsPDF } = await import('jspdf');
        await import('jspdf-autotable');

        const monthDate = new Date(reportMonth + '-02');
        const firstDay = format(startOfMonth(monthDate), 'yyyy-MM-dd');
        const lastDay = format(endOfMonth(monthDate), 'yyyy-MM-dd');

        const absensiReportQuery = query(
            collection(firestore, 'absensiSiswa'),
            where('tanggal', '>=', firstDay),
            where('tanggal', '<=', lastDay),
            where('kelas', '==', Number(selectedKelas))
        );

        const absensiSnap = await getDocs(absensiReportQuery);
        const monthlyAbsensi = absensiSnap.docs.map(d => d.data() as AbsensiSiswa);
        
        const recap: { [key: string]: { nama: string, nis: string, Hadir: number, Izin: number, Sakit: number, Alpha: number } } = {};
        
        students.forEach(student => {
            recap[student.id] = { nama: student.nama, nis: student.nis, Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
        });

        monthlyAbsensi.forEach(absen => {
            if (recap[absen.siswaId]) {
                recap[absen.siswaId][absen.status]++;
            }
        });
        
        const doc = new (jsPDF as any)();
        const monthFormatted = format(monthDate, 'MMMM yyyy', { locale: id });
        doc.text(`Laporan Absensi Siswa Kelas ${selectedKelas} - ${monthFormatted}`, 14, 15);
        doc.setFontSize(10);

        doc.autoTable({
            head: [['NIS', 'Nama Siswa', 'Hadir', 'Izin', 'Sakit', 'Alpha']],
            body: Object.values(recap).map(data => [
                data.nis,
                data.nama,
                data.Hadir,
                data.Izin,
                data.Sakit,
                data.Alpha,
            ]).sort((a,b) => String(a[1]).localeCompare(String(b[1]))), // Sort by name
            startY: 20,
        });

        doc.save(`laporan_absensi_siswa_kelas_${selectedKelas}_${reportMonth}.pdf`);
        toast({ title: "Laporan Berhasil Dibuat!", description: "File PDF telah diunduh." });
    } catch (error) {
        console.error("Failed to export PDF:", error);
        toast({ variant: 'destructive', title: "Gagal Membuat Laporan", description: "Terjadi kesalahan saat mengambil data laporan. Coba lagi atau hubungi admin." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Absensi Siswa</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 items-end">
            <div>
                <label className="text-sm font-medium">Tanggal</label>
                <input 
                    type="date" 
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                    className="border rounded-md p-2 w-full mt-1"
                />
            </div>
             <div>
                <label className="text-sm font-medium">Kelas</label>
                <Select value={selectedKelas} onValueChange={setSelectedKelas}>
                    <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Pilih Kelas" />
                    </SelectTrigger>
                    <SelectContent>
                        {KELAS_OPTIONS.map(k => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="lg:col-span-2">
                <label className="text-sm font-medium">Jadwal Pelajaran</label>
                 <Select value={selectedJadwalId || ''} onValueChange={setSelectedJadwalId}>
                    <SelectTrigger className="w-full mt-1" disabled={!jadwal || jadwal.length === 0}>
                        <SelectValue placeholder={jadwal && jadwal.length > 0 ? "Pilih Jadwal" : "Tidak ada jadwal hari ini"} />
                    </SelectTrigger>
                    <SelectContent>
                        {(jadwal || []).map(j => (
                            <SelectItem key={j.id} value={j.id}>
                                {j.jam} - {kurikulumMap.get(j.kurikulumId)} ({teachersMap.get(j.guruId)})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="lg:col-span-full flex items-center gap-2">
                <label htmlFor="report-month-siswa" className="text-sm font-medium whitespace-nowrap">Laporan Bulanan:</label>
                <input
                    type="month"
                    id="report-month-siswa"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="border rounded-md p-2 w-full"
                />
                <Button onClick={handleExportSiswaPdf} variant="outline" size="sm" disabled={!reportMonth || sortedStudents.length === 0}>
                    <FileDown className="h-4 w-4 mr-2" /> Ekspor PDF
                </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        {selectedJadwalId ? (
            <>
            {isLoading ? <p>Memuat siswa...</p> : (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Nama Siswa</TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead className="w-[150px]">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedStudents.map(siswa => {
                        const currentStatus = absensiSiswaMap.get(siswa.id)?.status;
                        return (
                        <TableRow key={siswa.id}>
                            <TableCell>{siswa.nama}</TableCell>
                            <TableCell>{siswa.nis}</TableCell>
                            <TableCell>
                                <Select 
                                    value={currentStatus || undefined}
                                    onValueChange={(status: AbsensiSiswa['status']) => handleStatusChange(siswa.id, status)}
                                    disabled={!isAdmin}
                                >
                                    <SelectTrigger className={
                                        currentStatus === 'Hadir' ? 'bg-green-100 dark:bg-green-900' :
                                        currentStatus === 'Alpha' ? 'bg-red-100 dark:bg-red-900' : ''
                                    }>
                                        <SelectValue placeholder="Pilih Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                        </TableRow>
                    )})}
                </TableBody>
                </Table>
            )}
            {sortedStudents.length === 0 && !isLoading && <p>Tidak ada siswa di kelas ini.</p>}
            </>
        ) : (
            <p className="text-center text-muted-foreground py-8">Pilih tanggal, kelas, dan jadwal pelajaran untuk memulai absensi.</p>
        )}
      </CardContent>
    </Card>
  );
}

    