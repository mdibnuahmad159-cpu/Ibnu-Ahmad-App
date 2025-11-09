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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AbsensiSiswa, Guru, Jadwal, Kurikulum, Siswa } from '@/lib/data';
import { useFirestore, useUser, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { format, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { FileDown } from 'lucide-react';
import type jsPDF from 'jspdf';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

const HARI_MAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const KELAS_OPTIONS = ['0', '1', '2', '3', '4', '5', '6'];
const STATUS_OPTIONS: AbsensiSiswa['status'][] = ['Hadir', 'Izin', 'Sakit', 'Alpha'];

export default function AbsenSiswa() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [absensiSiswa, setAbsensiSiswa] = useState<AbsensiSiswa[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKelas, setSelectedKelas] = useState('1');
  const [selectedJadwalId, setSelectedJadwalId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  // Fetch static data (kurikulum, teachers) once
  useEffect(() => {
      if (!firestore || !user) return;
      const fetchData = async () => {
          try {
              const kurikulumQuery = collection(firestore, 'kurikulum');
              const guruQuery = collection(firestore, 'gurus');
              const [kurikulumSnap, guruSnap] = await Promise.all([getDocs(kurikulumQuery), getDocs(guruQuery)]);
              setKurikulum(kurikulumSnap.docs.map(d => ({ id: d.id, ...d.data() } as Kurikulum)));
              setTeachers(guruSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guru)));
          } catch (error) {
              console.error("Failed to fetch prerequisite data for AbsenSiswa", error);
              toast({ variant: 'destructive', title: "Gagal memuat data pendukung." });
          }
      };
      fetchData();
  }, [firestore, user, toast]);

  // Fetch dynamic data (jadwal, students) when date or class changes
  useEffect(() => {
    if (!firestore || !user ) return;

    setIsLoading(true);
    setSelectedJadwalId(null);
    setJadwal([]);
    
    const jadwalQuery = query(
      collection(firestore, 'jadwal'),
      where('hari', '==', dayName),
      where('kelas', '==', selectedKelas)
    );
    const unsubJadwal = onSnapshot(jadwalQuery, snap => {
        const jadwalData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Jadwal));
        setJadwal(jadwalData);
    }, (error) => {
        console.error("Error fetching jadwal:", error);
        toast({ variant: 'destructive', title: 'Gagal memuat jadwal.' });
    });
    
    const siswaQuery = query(
      collection(firestore, 'siswa'),
      where('status', '==', 'Aktif'),
      where('kelas', '==', Number(selectedKelas))
    );
    const unsubSiswa = onSnapshot(siswaQuery, snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Siswa)));
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching students:", error);
        toast({ variant: 'destructive', title: 'Gagal memuat data siswa.' });
        setIsLoading(false);
    });

    return () => {
      unsubJadwal();
      unsubSiswa();
    };
  }, [firestore, user, dayName, selectedKelas, toast]);

  // Fetch attendance data when jadwal changes
  useEffect(() => {
    if (!firestore || !selectedJadwalId) {
        setAbsensiSiswa([]);
        return;
    };
    
    const absensiQuery = query(
      collection(firestore, 'absensiSiswa'), 
      where('tanggal', '==', todayString),
      where('jadwalId', '==', selectedJadwalId)
    );
    
    const unsubAbsensi = onSnapshot(absensiQuery, snap => setAbsensiSiswa(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsensiSiswa))));

    return () => unsubAbsensi();
  }, [firestore, todayString, selectedJadwalId]);
  
  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k.mataPelajaran])), [kurikulum]);
  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const absensiSiswaMap = useMemo(() => new Map(absensiSiswa.map(a => [a.siswaId, a])), [absensiSiswa]);

  const sortedStudents = useMemo(() => [...students].sort((a,b) => a.nama.localeCompare(b.nama)), [students]);
  
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
        keterangan: ''
    };

    setDocumentNonBlocking(absensiRef, absensiData, { merge: true });
    toast({ title: 'Absensi diperbarui' });
  };

  const handleExportSiswaPdf = async () => {
    if (!firestore || !students.length) return;

    toast({ title: "Membuat Laporan...", description: "Harap tunggu sebentar." });

    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const monthDate = new Date(selectedMonth + "-01T12:00:00");
    const firstDay = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const lastDay = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    const studentIds = students.map(s => s.id);

    if(studentIds.length === 0) {
      toast({ variant: 'destructive', title: "Tidak ada siswa", description: "Tidak ada siswa di kelas ini untuk diekspor." });
      return;
    }
    
    // Efficiently query by batching student IDs (max 30 per 'in' query)
    const idBatches = [];
    for (let i = 0; i < studentIds.length; i += 30) {
        idBatches.push(studentIds.slice(i, i + 30));
    }
    
    const absensiPromises = idBatches.map(batch => {
        const absensiQuery = query(collection(firestore, 'absensiSiswa'), 
            where('siswaId', 'in', batch),
            where('tanggal', '>=', firstDay), 
            where('tanggal', '<=', lastDay)
        );
        return getDocs(absensiQuery);
    });

    const absensiSnapshots = await Promise.all(absensiPromises);
    const monthlyAbsensi = absensiSnapshots.flatMap(snap => snap.docs.map(d => d.data() as AbsensiSiswa));
    
    const attendanceByStudent: { [key: string]: { summary: { [key: string]: number }, total: number } } = {};

    students.forEach(student => {
      attendanceByStudent[student.id] = {
        summary: { 'Hadir': 0, 'Izin': 0, 'Sakit': 0, 'Alpha': 0 },
        total: 0
      };
    });
    
    monthlyAbsensi.forEach(absen => {
      if (attendanceByStudent[absen.siswaId]) {
        attendanceByStudent[absen.siswaId].summary[absen.status]++;
        attendanceByStudent[absen.siswaId].total++;
      }
    });

    const doc = new jsPDF() as jsPDFWithAutoTable;
    doc.text(`Laporan Absensi Siswa Kelas ${selectedKelas} - ${format(monthDate, 'MMMM yyyy', { locale: id })}`, 14, 15);
    
    const summaryBody = sortedStudents.map(student => {
        const studentData = attendanceByStudent[student.id] || { summary: { 'Hadir': 0, 'Izin': 0, 'Sakit': 0, 'Alpha': 0 } };
        return [
            student.nama,
            student.nis,
            studentData.summary.Hadir,
            studentData.summary.Izin,
            studentData.summary.Sakit,
            studentData.summary.Alpha,
        ];
    });

    doc.autoTable({
        head: [['Nama Siswa', 'NIS', 'Hadir', 'Izin', 'Sakit', 'Alpha']],
        body: summaryBody,
        startY: 20
    });
    
    doc.save(`laporan_absen_kelas_${selectedKelas}_${selectedMonth}.pdf`);
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
                    <SelectTrigger className="w-full mt-1" disabled={jadwal.length === 0}>
                        <SelectValue placeholder={jadwal.length > 0 ? "Pilih Jadwal" : "Tidak ada jadwal hari ini"} />
                    </SelectTrigger>
                    <SelectContent>
                        {jadwal.map(j => (
                            <SelectItem key={j.id} value={j.id}>
                                {j.jam} - {kurikulumMap.get(j.kurikulumId)} ({teachersMap.get(j.guruId)})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto justify-end mt-4">
            <div className='flex items-center gap-2'>
                <label htmlFor="month-picker-siswa" className="text-sm font-medium">Laporan Bulan:</label>
                <input 
                    type="month" 
                    id="month-picker-siswa"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border rounded-md p-2"
                />
            </div>
            <Button onClick={handleExportSiswaPdf} variant="outline" size="sm" disabled={!students || students.length === 0}>
                <FileDown className="mr-2 h-4 w-4" /> Ekspor PDF
            </Button>
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
