
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
import { useFirestore, useUser, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { format, getDay } from 'date-fns';
import { id } from 'date-fns/locale';

const HARI_MAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const KELAS_OPTIONS = ['0', '1', '2', '3', '4', '5', '6'];
const STATUS_OPTIONS: AbsensiSiswa['status'][] = ['Hadir', 'Izin', 'Sakit', 'Alpha'];

export default function AbsenSiswa() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  // Data
  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [absensiSiswa, setAbsensiSiswa] = useState<AbsensiSiswa[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedKelas, setSelectedKelas] = useState('1');
  const [selectedJadwalId, setSelectedJadwalId] = useState<string | null>(null);

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  // Fetch data based on filters
  useEffect(() => {
    if (!firestore || !user) return;
    setIsLoading(true);

    const jadwalQuery = query(
      collection(firestore, 'jadwal'), 
      where('hari', '==', dayName),
      where('kelas', '==', selectedKelas)
    );
    const siswaQuery = query(
      collection(firestore, 'siswa'), 
      where('status', '==', 'Aktif'), 
      where('kelas', '==', Number(selectedKelas))
    );
    const absensiQuery = query(
      collection(firestore, 'absensiSiswa'), 
      where('tanggal', '==', todayString),
      where('jadwalId', '==', selectedJadwalId || '')
    );
    const kurikulumQuery = collection(firestore, 'kurikulum');
    const guruQuery = collection(firestore, 'gurus');


    const unsubJadwal = onSnapshot(jadwalQuery, snap => setJadwal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jadwal))));
    const unsubSiswa = onSnapshot(siswaQuery, snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Siswa))));
    const unsubAbsensi = onSnapshot(absensiQuery, snap => setAbsensiSiswa(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsensiSiswa))));
    const unsubKurikulum = onSnapshot(kurikulumQuery, snap => setKurikulum(snap.docs.map(d => ({ id: d.id, ...d.data() } as Kurikulum))));
    const unsubGuru = onSnapshot(guruQuery, snap => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Guru)))
      setIsLoading(false);
    });

    return () => {
      unsubJadwal();
      unsubSiswa();
      unsubAbsensi();
      unsubKurikulum();
      unsubGuru();
    };

  }, [firestore, user, todayString, dayName, selectedKelas, selectedJadwalId]);

  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k.mataPelajaran])), [kurikulum]);
  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const absensiSiswaMap = useMemo(() => new Map(absensiSiswa.map(a => [a.siswaId, a])), [absensiSiswa]);

  const sortedStudents = useMemo(() => [...students].sort((a,b) => a.nama.localeCompare(b.nama)), [students]);
  
  const handleStatusChange = async (siswaId: string, status: AbsensiSiswa['status']) => {
    if (!firestore || !isAdmin || !selectedJadwalId) return;

    const existingAbsensi = absensiSiswaMap.get(siswaId);
    const absensiRef = existingAbsensi
        ? doc(firestore, 'absensiSiswa', existingAbsensi.id)
        : doc(collection(firestore, 'absensiSiswa'));

    const absensiData: Omit<AbsensiSiswa, 'id'> = {
        jadwalId: selectedJadwalId,
        siswaId: siswaId,
        tanggal: todayString,
        status: status
    };

    try {
        await setDocumentNonBlocking(absensiRef, absensiData, { merge: true });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal menyimpan absensi siswa.'});
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Absensi Siswa</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
                                    value={currentStatus || 'Hadir'}
                                    onValueChange={(status: AbsensiSiswa['status']) => handleStatusChange(siswa.id, status)}
                                    disabled={!isAdmin}
                                >
                                    <SelectTrigger className={
                                        currentStatus === 'Hadir' ? 'bg-green-100 dark:bg-green-900' :
                                        currentStatus === 'Alpha' ? 'bg-red-100 dark:bg-red-900' : ''
                                    }>
                                        <SelectValue />
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
            <p className="text-center text-muted-foreground py-8">Pilih kelas dan jadwal pelajaran untuk memulai absensi.</p>
        )}
      </CardContent>
    </Card>
  );
}
