
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, MoreHorizontal, Pencil, Trash2, FileDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { JadwalUjian, Guru, Kurikulum } from '@/lib/data';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc, query, where, getDocs, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

const emptyJadwalUjian: Omit<JadwalUjian, 'id'> = {
  hari: 'Sabtu',
  tanggal: new Date().toISOString().split('T')[0],
  jam: '07:30 - 09:00',
  mataPelajaran: '',
  guruId: '',
  kelas: '0',
  guruName: '',
  kitab: ''
};

const HARI_OPERASIONAL = ['Sabtu', 'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis'];
const JAM_UJIAN = ['07:30 - 09:00', '09:30 - 11:00'];
const KELAS_OPTIONS = ['all', '0', '1', '2', '3', '4', '5', '6'];

export default function JadwalUjianComponent() {
  const firestore = useFirestore();
  const { isAdmin } = useAdmin();
  const { user } = useUser();
  const { toast } = useToast();

  const [jadwalUjian, setJadwalUjian] = useState<JadwalUjian[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [kitabPelajaran, setKitabPelajaran] = useState<Kurikulum[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedKelas, setSelectedKelas] = useState('all');
  const [selectedHari, setSelectedHari] = useState('all');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [jadwalToEdit, setJadwalToEdit] = useState<JadwalUjian | null>(null);
  const [jadwalToDelete, setJadwalToDelete] = useState<JadwalUjian | null>(null);
  const [formData, setFormData] = useState<Omit<JadwalUjian, 'id'>>(emptyJadwalUjian);

  useEffect(() => {
    if (!firestore || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let unsub: Unsubscribe | null = null;

    const fetchData = async () => {
      try {
        const [teachersSnap, kurikulumSnap] = await Promise.all([
          getDocs(collection(firestore, 'gurus')),
          getDocs(collection(firestore, 'kurikulum'))
        ]);
        
        setTeachers(teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guru)));
        setKitabPelajaran(kurikulumSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kurikulum)));
        
        const jadwalQuery = selectedKelas === 'all'
            ? collection(firestore, 'jadwalUjian')
            : query(collection(firestore, 'jadwalUjian'), where('kelas', '==', selectedKelas));
        
        unsub = onSnapshot(jadwalQuery, snapshot => {
          setJadwalUjian(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JadwalUjian)));
          setIsLoading(false);
        }, error => {
          console.error("Error fetching exam schedule:", error);
          toast({ variant: 'destructive', title: 'Gagal Memuat Jadwal Ujian' });
          setIsLoading(false);
        });

      } catch (error) {
        console.error("Error fetching prerequisites:", error);
        toast({ variant: 'destructive', title: 'Gagal Memuat Data Guru/Kurikulum' });
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      if (unsub) unsub();
    };
  }, [selectedKelas, firestore, user]);

  const jadwalByKelasHariJam = useMemo(() => {
    const grouped: { [key: string]: JadwalUjian } = {};
    (jadwalUjian || []).forEach(item => {
      const key = `${item.kelas}-${item.hari}-${item.jam}`;
      grouped[key] = item;
    });
    return grouped;
  }, [jadwalUjian]);

  const filteredHariOperasional = useMemo(() => {
    if (selectedHari === 'all') {
      return HARI_OPERASIONAL;
    }
    return [selectedHari];
  }, [selectedHari]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleOpenDialog = (item: JadwalUjian | null = null, defaults: Partial<Omit<JadwalUjian, 'id'>> = {}) => {
    if (!isAdmin) return;
    setJadwalToEdit(item);
    if(item) {
        const { id, ...rest } = item;
        setFormData(rest);
    } else {
        const defaultKelas = selectedKelas !== 'all' ? { kelas: selectedKelas } : {};
        setFormData({ ...emptyJadwalUjian, ...defaultKelas, ...defaults });
    }
    setIsDialogOpen(true);
  };

  const handleSaveJadwal = () => {
    if (!firestore) return;
    const jadwalUjianCollectionRef = collection(firestore, 'jadwalUjian');
    if (formData.kelas && formData.mataPelajaran && formData.guruId && formData.jam && formData.hari && formData.tanggal) {
      
      const selectedTeacher = teachers.find(t => t.id === formData.guruId);
      const selectedKurikulum = kitabPelajaran.find(k => k.mataPelajaran === formData.mataPelajaran && k.kelas === formData.kelas);

      const dataToSave: Omit<JadwalUjian, 'id'> = {
          ...formData,
          guruName: selectedTeacher?.name || '',
          kitab: selectedKurikulum?.kitab || '',
          kurikulumId: selectedKurikulum?.id,
      };

      if (jadwalToEdit) {
        const jadwalDocRef = doc(firestore, 'jadwalUjian', jadwalToEdit.id);
        updateDocumentNonBlocking(jadwalDocRef, dataToSave);
      } else {
        addDocumentNonBlocking(jadwalUjianCollectionRef, dataToSave);
      }
      toast({ title: 'Sukses!', description: 'Jadwal ujian berhasil disimpan.' });
      setIsDialogOpen(false);
      setJadwalToEdit(null);
    } else {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Mohon lengkapi semua data.' });
    }
  };

  const handleDeleteJadwal = (item: JadwalUjian) => {
    if (!isAdmin) return;
    setJadwalToDelete(item);
  };

  const confirmDelete = () => {
    if (jadwalToDelete && firestore) {
      const jadwalDocRef = doc(firestore, 'jadwalUjian', jadwalToDelete.id);
      deleteDocumentNonBlocking(jadwalDocRef);
      setJadwalToDelete(null);
      toast({ title: 'Sukses!', description: 'Jadwal ujian berhasil dihapus.' });
    }
  };
  
  const getTeacherName = (guruName?: string) => {
    return guruName ? guruName.split(',')[0] : '...';
  };

  const handleExportPdf = () => {
    if (!jadwalUjian) return;
    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    const kelasTitle = selectedKelas === 'all' ? 'Semua Kelas' : `Kelas ${selectedKelas}`;
    const hariTitle = selectedHari === 'all' ? 'Semua Hari' : `Hari ${selectedHari}`;
    const title = `Jadwal Ujian - ${kelasTitle} (${hariTitle})`;
    doc.text(title, 20, 10);
    
    const head: any[] = [['Kelas', 'Hari', 'Tanggal', 'Jam', 'Mata Pelajaran', 'Pengawas']];
    const body: any[] = [];
    
    const dataToExport = (jadwalUjian || [])
      .filter(item => {
        const kelasMatch = selectedKelas === 'all' || item.kelas === selectedKelas;
        const hariMatch = selectedHari === 'all' || item.hari === selectedHari;
        return kelasMatch && hariMatch;
      });

    dataToExport
      .sort((a,b) => Number(a.kelas) - Number(b.kelas) || HARI_OPERASIONAL.indexOf(a.hari) - HARI_OPERASIONAL.indexOf(b.hari) || a.jam.localeCompare(b.jam))
      .forEach(item => {
        body.push([
          `Kelas ${item.kelas}`,
          item.hari,
          item.tanggal,
          item.jam,
          item.mataPelajaran,
          getTeacherName(item.guruName)
        ]);
    });

    doc.autoTable({ head, body });
    doc.save(`jadwal-ujian.pdf`);
  };

  const renderInteractiveGrid = (kelas: string) => {
    return (
        <Card key={kelas} className="mb-8 overflow-hidden">
            <CardHeader>
                <CardTitle className="font-headline text-2xl text-primary">Kelas {kelas}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="relative overflow-x-auto -m-2 p-2">
                    <div className="flex space-x-4 pb-2">
                        {filteredHariOperasional.map(hari => (
                        <div key={hari} className="rounded-lg p-4 flex-shrink-0 w-56 bg-muted/30 shadow-inner">
                            <h3 className="font-headline text-lg font-bold text-center mb-4">{hari}</h3>
                            <div className="space-y-2">
                            {JAM_UJIAN.map(jam => {
                                const key = `${kelas}-${hari}-${jam}`;
                                const jadwalItem = jadwalByKelasHariJam[key];
                                return (
                                <div key={jam} className="border rounded-lg p-3 min-h-[100px] flex flex-col justify-between bg-card shadow-sm transition-shadow hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                    <p className="text-xs font-semibold text-muted-foreground">{jam}</p>
                                    {jadwalItem && <p className="text-xs font-semibold text-muted-foreground">{jadwalItem.tanggal}</p>}
                                    </div>
                                    {jadwalItem ? (
                                    <div className="mt-1">
                                        <p className="font-bold text-sm text-primary truncate" title={jadwalItem.mataPelajaran}>{jadwalItem.mataPelajaran}</p>
                                        <div className="flex justify-between items-center mt-1">
                                        <p className="text-xs truncate text-muted-foreground" title={getTeacherName(jadwalItem.guruName)}>Pengawas: {getTeacherName(jadwalItem.guruName)}</p>
                                        {isAdmin && (
                                            <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleOpenDialog(jadwalItem)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDeleteJadwal(jadwalItem)} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Hapus</DropdownMenuItem>
                                            </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                        </div>
                                    </div>
                                    ) : (
                                    <div className="flex items-center justify-center flex-grow">
                                        {isAdmin ? (
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(null, { kelas, hari, jam })}>
                                            <PlusCircle className="h-5 w-5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                                        </Button>
                                        ) : <span className="text-xs text-muted-foreground">-</span>}
                                    </div>
                                    )}
                                </div>
                                );
                            })}
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isAdmin && (
            <Button onClick={() => handleOpenDialog()} size="sm">
              <PlusCircle className="mr-2 h-4 w-4" /> Tambah Jadwal Ujian
            </Button>
          )}
          <Button onClick={handleExportPdf} variant="outline" size="sm" disabled={!jadwalUjian || jadwalUjian.length === 0}>
            <FileDown className="mr-2 h-4 w-4" /> Ekspor PDF
          </Button>
        </div>
        <div className="flex gap-4">
            <Select value={selectedHari} onValueChange={setSelectedHari}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter Hari" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Semua Hari</SelectItem>
                    {HARI_OPERASIONAL.map(hari => (
                        <SelectItem key={hari} value={hari}>{hari}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={selectedKelas} onValueChange={(value) => setSelectedKelas(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Pilih Kelas" />
              </SelectTrigger>
              <SelectContent>
                {KELAS_OPTIONS.map(kelas => 
                  <SelectItem key={kelas} value={kelas}>
                      {kelas === 'all' ? 'Semua Kelas' : `Kelas ${kelas}`}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
        </div>
      </div>

      {isLoading ? <p className="text-center">Memuat jadwal...</p> : (
        <div>
            {selectedKelas === 'all' 
                ? KELAS_OPTIONS.filter(k => k !== 'all').map(kelas => renderInteractiveGrid(kelas))
                : (!jadwalUjian || jadwalUjian.length === 0) && !isAdmin
                ? <p className="text-center text-muted-foreground mt-8">Belum ada jadwal ujian yang dibuat untuk kelas ini.</p>
                : renderInteractiveGrid(selectedKelas)
            }
        </div>
      )}

      {isAdmin && (
        <>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{jadwalToEdit ? 'Edit Jadwal Ujian' : 'Tambah Jadwal Ujian'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="kelas">Kelas</Label>
                  <Select name="kelas" onValueChange={v => handleSelectChange('kelas', v)} value={formData.kelas}>
                    <SelectTrigger><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                    <SelectContent>{KELAS_OPTIONS.filter(k => k !== 'all').map(k => <SelectItem key={k} value={k}>Kelas {k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hari">Hari</Label>
                  <Select name="hari" onValueChange={v => handleSelectChange('hari', v)} value={formData.hari}>
                    <SelectTrigger><SelectValue placeholder="Pilih Hari" /></SelectTrigger>
                    <SelectContent>{HARI_OPERASIONAL.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="tanggal">Tanggal</Label>
                    <Input id="tanggal" name="tanggal" type="date" value={formData.tanggal} onChange={handleInputChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jam">Jam</Label>
                  <Select name="jam" onValueChange={v => handleSelectChange('jam', v)} value={formData.jam}>
                    <SelectTrigger><SelectValue placeholder="Pilih Jam" /></SelectTrigger>
                    <SelectContent>{JAM_UJIAN.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mataPelajaran">Mata Pelajaran</Label>
                  <Select name="mataPelajaran" onValueChange={v => handleSelectChange('mataPelajaran', v)} value={formData.mataPelajaran}>
                    <SelectTrigger onPointerDown={async () => { if (kitabPelajaran.length === 0) await getDocs(collection(firestore, 'kurikulum')); }}><SelectValue placeholder={'Pilih Mata Pelajaran'} /></SelectTrigger>
                    <SelectContent>{kitabPelajaran?.filter(k => k.kelas === formData.kelas).map(m => <SelectItem key={m.id} value={m.mataPelajaran}>[{m.kode}] {m.mataPelajaran}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guruId">Pengawas</Label>
                  <Select name="guruId" onValueChange={v => handleSelectChange('guruId', v)} value={formData.guruId}>
                    <SelectTrigger onPointerDown={async () => { if (teachers.length === 0) await getDocs(collection(firestore, 'gurus'));}}><SelectValue placeholder={'Pilih Pengawas'} /></SelectTrigger>
                    <SelectContent>{teachers?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSaveJadwal}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog open={!!jadwalToDelete} onOpenChange={() => setJadwalToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Anda yakin ingin menghapus?</AlertDialogTitle>
                <AlertDialogDescription>Jadwal ujian ini akan dihapus secara permanen.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
