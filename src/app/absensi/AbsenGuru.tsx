
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
import { useFirestore, useUser, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { format, getDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { useCollection } from '@/firebase/firestore/use-collection';

const HARI_MAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STATUS_OPTIONS: AbsensiGuru['status'][] = ['Hadir', 'Izin', 'Sakit', 'Alpha'];

export default function AbsenGuru() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [isStaticDataLoading, setIsStaticDataLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(new Date());

  const todayString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayName = useMemo(() => HARI_MAP[getDay(selectedDate)], [selectedDate]);

  useEffect(() => {
    if (!firestore || !user) return;
    
    const fetchStaticData = async () => {
      setIsStaticDataLoading(true);
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
      } finally {
        setIsStaticDataLoading(false);
      }
    };

    fetchStaticData();
  }, [firestore, user, toast]);

  const jadwalQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'jadwal'), where('hari', '==', dayName));
  }, [firestore, user, dayName]);
  const { data: jadwal, isLoading: isJadwalLoading } = useCollection<Jadwal>(jadwalQuery);

  const absensiQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'absensiGuru'), where('tanggal', '==', todayString));
  }, [firestore, user, todayString]);
  const { data: absensi, isLoading: isAbsensiLoading } = useCollection<AbsensiGuru>(absensiQuery);
  
  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, k])), [kurikulum]);
  const absensiMap = useMemo(() => new Map((absensi || []).map(a => [a.jadwalId, a])), [absensi]);

  const jadwalSorted = useMemo(() => 
    [...(jadwal || [])].sort((a,b) => a.jam.localeCompare(b.jam) || a.kelas.localeCompare(b.kelas))
  , [jadwal]);

  const isLoading = isStaticDataLoading || isJadwalLoading || isAbsensiLoading;

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
