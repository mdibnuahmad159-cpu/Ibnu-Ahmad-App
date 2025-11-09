
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
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { format, getDay } from 'date-fns';
import { id } from 'date-fns/locale';

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

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  useEffect(() => {
    if (!firestore || !user) return;
    setIsLoading(true);

    const jadwalQuery = query(collection(firestore, 'jadwal'), where('hari', '==', dayName));
    const guruQuery = collection(firestore, 'gurus');
    const kurikulumQuery = collection(firestore, 'kurikulum');
    const absensiQuery = query(collection(firestore, 'absensiGuru'), where('tanggal', '==', todayString));

    const unsubJadwal = onSnapshot(jadwalQuery, snap => setJadwal(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jadwal))));
    const unsubGuru = onSnapshot(guruQuery, snap => setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Guru))));
    const unsubKurikulum = onSnapshot(kurikulumQuery, snap => setKurikulum(snap.docs.map(d => ({ id: d.id, ...d.data() } as Kurikulum))));
    const unsubAbsensi = onSnapshot(absensiQuery, snap => {
      setAbsensi(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsensiGuru)))
      setIsLoading(false);
    });

    return () => {
      unsubJadwal();
      unsubGuru();
      unsubKurikulum();
      unsubAbsensi();
    };
  }, [firestore, user, todayString, dayName]);

  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k.mataPelajaran])), [kurikulum]);
  const absensiMap = useMemo(() => new Map(absensi.map(a => [a.jadwalId, a])), [absensi]);

  const jadwalSorted = useMemo(() => 
    [...jadwal].sort((a,b) => a.jam.localeCompare(b.jam) || a.kelas.localeCompare(b.kelas))
  , [jadwal]);

  const handleStatusChange = async (jadwalItem: Jadwal, status: AbsensiGuru['status']) => {
    if (!firestore || !isAdmin) return;
    
    const existingAbsensi = absensiMap.get(jadwalItem.id);
    const absensiRef = existingAbsensi 
      ? doc(firestore, 'absensiGuru', existingAbsensi.id) 
      : doc(collection(firestore, 'absensiGuru'));

    const absensiData: Omit<AbsensiGuru, 'id'> = {
      jadwalId: jadwalItem.id,
      guruId: jadwalItem.guruId,
      tanggal: todayString,
      status: status,
      keterangan: '',
    };
    
    try {
      await setDocumentNonBlocking(absensiRef, absensiData, { merge: true });
      toast({ title: 'Absensi diperbarui', description: `Status guru ${teachersMap.get(jadwalItem.guruId)} diubah menjadi ${status}.`});
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan absensi' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Absensi Guru - {format(selectedDate, 'eeee, dd MMMM yyyy', { locale: id })}</CardTitle>
        <div className="flex items-center gap-2 mt-4">
          <label htmlFor="date-picker">Pilih Tanggal:</label>
          <input 
            type="date" 
            id="date-picker"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="border rounded-md p-2"
          />
        </div>
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
                <p className="font-bold">{kurikulumMap.get(item.kurikulumId) || 'Memuat...'}</p>
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
