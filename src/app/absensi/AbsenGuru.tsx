'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Jadwal, Guru, Kurikulum, AbsensiGuru } from '@/lib/data';
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
const STATUS_OPTIONS: AbsensiGuru['status'][] = ['Hadir', 'Izin', 'Sakit', 'Alpha'];

export default function AbsenGuru() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [absensi, setAbsensi] = useState<AbsensiGuru[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  // Fetch static data (teachers, curriculum) once
  useEffect(() => {
    if (!firestore || !user) return;
    
    const fetchStaticData = async () => {
      try {
        const guruQuery = collection(firestore, 'gurus');
        const kurikulumQuery = collection(firestore, 'kurikulum');
        
        const [guruSnap, kurikulumSnap] = await Promise.all([
            getDocs(guruQuery),
            getDocs(kurikulumQuery),
        ]);

        setTeachers(guruSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guru)));
        setKurikulum(kurikulumSnap.docs.map(d => ({ id: d.id, ...d.data() } as Kurikulum)));

      } catch (error) {
        console.error("Failed to fetch static data for AbsenGuru", error);
        toast({ variant: 'destructive', title: "Gagal memuat data pendukung."});
      }
    };

    fetchStaticData();
  }, [firestore, user, toast]);

  // Fetch dynamic data (schedule, attendance) and update on date change
  useEffect(() => {
    if (!firestore || !user) return; 

    setIsLoading(true);

    const jadwalQuery = query(collection(firestore, 'jadwal'), where('hari', '==', dayName));
    const unsubJadwal = onSnapshot(jadwalQuery, snap => {
        setJadwal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jadwal)));
    }, (error) => {
        console.error("Error fetching jadwal:", error);
        toast({ variant: 'destructive', title: 'Gagal memuat jadwal.' });
    });
    
    const absensiQuery = query(collection(firestore, 'absensiGuru'), where('tanggal', '==', todayString));
    const unsubAbsensi = onSnapshot(absensiQuery, snap => {
      setAbsensi(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsensiGuru)));
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching absensi:", error);
        toast({ variant: 'destructive', title: 'Gagal memuat absensi.' });
        setIsLoading(false);
    });

    return () => {
      unsubJadwal();
      unsubAbsensi();
    };
  }, [firestore, user, toast, todayString, dayName]);

  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k])), [kurikulum]);
  const absensiMap = useMemo(() => new Map(absensi.map(a => [a.jadwalId, a])), [absensi]);

  const jadwalSorted = useMemo(() => 
    [...jadwal].sort((a,b) => a.jam.localeCompare(b.jam) || a.kelas.localeCompare(b.kelas))
  , [jadwal]);

  const handleStatusChange = (jadwalItem: Jadwal, status: AbsensiGuru['status']) => {
    if (!firestore || !isAdmin) return;
    
    const existingAbsensi = absensiMap.get(jadwalItem.id);
    const docId = existingAbsensi ? existingAbsensi.id : `${jadwalItem.id}_${todayString}`;
    const absensiRef = doc(firestore, 'absensiGuru', docId);

    const absensiData: Omit<AbsensiGuru, 'id'> = {
      jadwalId: jadwalItem.id,
      guruId: jadwalItem.guruId,
      tanggal: todayString,
      status: status,
      keterangan: '',
    };
    
    setDocumentNonBlocking(absensiRef, absensiData, { merge: true });
    toast({ title: 'Absensi diperbarui', description: `Status guru ${teachersMap.get(jadwalItem.guruId)} diubah menjadi ${status}.`});
  };

  const handleExportGuruPdf = async () => {
    if (!firestore || teachers.length === 0 || kurikulum.length === 0) {
      toast({ variant: 'destructive', title: "Data belum siap", description: "Tunggu data guru dan kurikulum termuat sepenuhnya."});
      return;
    };

    toast({ title: "Membuat Laporan...", description: "Harap tunggu sebentar." });
    
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const monthDate = new Date(selectedMonth + "-01T12:00:00");
    const firstDay = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const lastDay = format(endOfMonth(monthDate), 'yyyy-MM-dd');

    const absensiQuery = query(collection(firestore, 'absensiGuru'), 
        where('tanggal', '>=', firstDay), 
        where('tanggal', '<=', lastDay)
    );

    const [absensiSnap, jadwalSnap] = await Promise.all([
      getDocs(absensiQuery),
      getDocs(collection(firestore, 'jadwal'))
    ]);
    
    const monthlyAbsensi = absensiSnap.docs.map(d => d.data() as AbsensiGuru);
    const jadwalMap = new Map(jadwalSnap.docs.map(d => [d.id, d.data() as Jadwal]));

    const attendanceByTeacher: { [key: string]: { summary: { [key: string]: number }, details: any[] } } = {};

    teachers.forEach(teacher => {
      attendanceByTeacher[teacher.id] = {
        summary: { 'Hadir': 0, 'Izin': 0, 'Sakit': 0, 'Alpha': 0, 'Total': 0 },
        details: []
      };
    });
    
    monthlyAbsensi.forEach(absen => {
      if (attendanceByTeacher[absen.guruId]) {
        attendanceByTeacher[absen.guruId].summary[absen.status]++;
        attendanceByTeacher[absen.guruId].summary['Total']++;
        
        const jadwalItem = jadwalMap.get(absen.jadwalId);
        const kurikulumItem = jadwalItem ? kurikulumMap.get(jadwalItem.kurikulumId) : null;

        attendanceByTeacher[absen.guruId].details.push({
            tanggal: absen.tanggal,
            jam: jadwalItem?.jam || '-',
            mapel: kurikulumItem?.mataPelajaran || '-',
            kelas: `Kelas ${jadwalItem?.kelas || '-'}`,
            status: absen.status
        });
      }
    });

    const doc = new jsPDF() as jsPDFWithAutoTable;
    doc.text(`Laporan Absensi Guru - ${format(monthDate, 'MMMM yyyy', { locale: id })}`, 14, 15);

    const summaryBody = Object.keys(attendanceByTeacher).map(guruId => {
        const teacherData = attendanceByTeacher[guruId];
        const teacherName = teachersMap.get(guruId) || 'Nama Tidak Ditemukan';
        return [
            teacherName,
            teacherData.summary.Hadir,
            teacherData.summary.Izin,
            teacherData.summary.Sakit,
            teacherData.summary.Alpha,
            teacherData.summary.Total,
        ];
    });

    doc.autoTable({
        head: [['Nama Guru', 'Hadir', 'Izin', 'Sakit', 'Alpha', 'Total Pertemuan']],
        body: summaryBody,
        startY: 20,
        didDrawPage: (data) => { if(data.cursor) data.cursor.y = 20; }
    });

    Object.keys(attendanceByTeacher).forEach(guruId => {
      const teacherData = attendanceByTeacher[guruId];
      if (teacherData.details.length > 0) {
        doc.addPage();
        const teacherName = teachersMap.get(guruId) || 'Nama Tidak Ditemukan';
        doc.text(`Detail Kehadiran: ${teacherName}`, 14, 15);
        
        const detailBody = teacherData.details.sort((a,b) => a.tanggal.localeCompare(b.tanggal)).map(d => [d.tanggal, d.jam, d.mapel, d.kelas, d.status]);

        doc.autoTable({
          head: [['Tanggal', 'Jam', 'Mata Pelajaran', 'Kelas', 'Status']],
          body: detailBody,
          startY: 20
        });
      }
    });
    
    doc.save(`laporan_absen_guru_${selectedMonth}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Absensi Guru</CardTitle>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4">
            <div className='flex items-center gap-2'>
                <label htmlFor="date-picker" className="text-sm font-medium">Pilih Tanggal:</label>
                <input 
                    type="date" 
                    id="date-picker"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                    className="border rounded-md p-2"
                />
            </div>
             <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className='flex items-center gap-2'>
                    <label htmlFor="month-picker" className="text-sm font-medium">Laporan Bulan:</label>
                    <input 
                        type="month" 
                        id="month-picker"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border rounded-md p-2"
                    />
                </div>
                <Button onClick={handleExportGuruPdf} variant="outline" size="sm" disabled={teachers.length === 0}>
                    <FileDown className="mr-2 h-4 w-4" /> Ekspor PDF
                </Button>
            </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Jadwal untuk: {format(selectedDate, 'eeee, dd MMMM yyyy', { locale: id })}</p>
      </CardHeader>
      <CardContent>
        {isLoading && <p>Memuat jadwal...</p>}
        {!isLoading && jadwalSorted.length === 0 && <p>Tidak ada jadwal mengajar untuk hari ini.</p>}
        <div className="space-y-4">
          {jadwalSorted.map((item) => {
            const currentStatus = absensiMap.get(item.id)?.status;
            return (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center border p-4 rounded-lg">
              <div className="md:col-span-3">
                <p className="font-bold">{kurikulumMap.get(item.kurikulumId)?.mataPelajaran || 'Memuat...'}</p>
                <p className="text-sm text-muted-foreground">
                  {teachersMap.get(item.guruId) || 'Memuat...'} | Kelas {item.kelas} | {item.jam}
                </p>
              </div>
              <div>
                <Select
                  value={currentStatus}
                  onValueChange={(status: AbsensiGuru['status']) => handleStatusChange(item, status)}
                  disabled={!isAdmin}
                >
                  <SelectTrigger className={
                    currentStatus === 'Hadir' ? 'bg-green-100 dark:bg-green-900 border-green-300' :
                    currentStatus === 'Alpha' ? 'bg-red-100 dark:bg-red-900 border-red-300' : ''
                  }>
                    <SelectValue placeholder="Pilih Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(status => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )})}
        </div>
      </CardContent>
    </Card>
  );
}
