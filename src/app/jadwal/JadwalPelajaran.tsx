
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FileDown, PlusCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Label } from '@/components/ui/label';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Jadwal, Guru, Kurikulum } from '@/lib/data';
import { useFirestore, useUser, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, onSnapshot, Unsubscribe, getDocs } from 'firebase/firestore';
import { useAdmin } from '@/context/AdminProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

const emptyJadwal: Omit<Jadwal, 'id'> = {
  hari: 'Sabtu',
  kelas: '0',
  jam: '14:00 - 15:00',
  guruId: '',
  kurikulumId: ''
};

const HARI_OPERASIONAL = ['Sabtu', 'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis'];
const JAM_PELAJARAN = ['14:00 - 15:00', '15:30 - 16:30'];
const KELAS_OPTIONS = ['all', '0', '1', '2', '3', '4', '5', '6'];


export default function JadwalPelajaranComponent() {
  const firestore = useFirestore();
  const { isAdmin } = useAdmin();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [teachers, setTeachers] = useState<Guru[]>([]);
  const [kurikulum, setKurikulum] = useState<Kurikulum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedKelas, setSelectedKelas] = useState('all');

  const teachersMap = useMemo(() => new Map(teachers.map(t => [t.id, t.name])), [teachers]);
  const kurikulumMap = useMemo(() => new Map(kurikulum.map(k => [k.id, {pelajaran: k.mataPelajaran, kitab: k.kitab}])), [kurikulum]);
  
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
        setKurikulum(kurikulumSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kurikulum)));
        
        // After fetching prerequisites, set up the listener for the schedule
        let jadwalQuery;
        if (selectedKelas === 'all') {
          jadwalQuery = collection(firestore, 'jadwal');
        } else {
          jadwalQuery = query(collection(firestore, 'jadwal'), where('kelas', '==', selectedKelas));
        }

        unsub = onSnapshot(jadwalQuery, snapshot => {
          setJadwal(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Jadwal)));
          setIsLoading(false);
        }, error => {
          console.error("Error fetching schedule:", error);
          toast({ variant: 'destructive', title: 'Gagal Memuat Jadwal' });
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
      if (unsub) {
        unsub();
      }
    };
  }, [selectedKelas, firestore, user]);


  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [jadwalToEdit, setJadwalToEdit] = useState<Jadwal | null>(null);
  const [jadwalToDelete, setJadwalToDelete] = useState<Jadwal | null>(null);
  const [formData, setFormData] = useState<Omit<Jadwal, 'id'>>(emptyJadwal);
  const [selectedHari, setSelectedHari] = useState('all');

  const jadwalByKelasHariJam = useMemo(() => {
    const grouped: { [key: string]: Jadwal } = {};
    jadwal.forEach(item => {
      const key = `${item.kelas}-${item.hari}-${item.jam}`;
      grouped[key] = item;
    });
    return grouped;
  }, [jadwal]);

  const filteredHariOperasional = useMemo(() => {
    if (selectedHari === 'all') {
      return HARI_OPERASIONAL;
    }
    return [selectedHari];
  }, [selectedHari]);
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenDialog = (item: Jadwal | null = null, defaults: Partial<Omit<Jadwal, 'id'>> = {}) => {
    if (!isAdmin) return;
    setJadwalToEdit(item);
    if (item) {
      setFormData({ hari: item.hari, kelas: item.kelas, jam: item.jam, guruId: item.guruId, kurikulumId: item.kurikulumId });
    } else {
      setFormData({ ...emptyJadwal, ...defaults, ...(selectedKelas !== 'all' && { kelas: selectedKelas }) });
    }
    setIsDialogOpen(true);
  };

  const handleSaveJadwal = () => {
    if (!firestore) return;
    const jadwalCollectionRef = collection(firestore, 'jadwal');
    if (formData.kelas && formData.kurikulumId && formData.guruId && formData.jam && formData.hari) {
      
      const dataToSave: Omit<Jadwal, 'id'> = {
        ...formData,
      };

      if (jadwalToEdit) {
        const jadwalDocRef = doc(firestore, 'jadwal', jadwalToEdit.id);
        updateDocumentNonBlocking(jadwalDocRef, dataToSave);
      } else {
        addDocumentNonBlocking(jadwalCollectionRef, dataToSave);
      }
      setIsDialogOpen(false);
      setJadwalToEdit(null);
    }
  };

  const handleDeleteJadwal = (item: Jadwal) => {
    if (!isAdmin) return;
    setJadwalToDelete(item);
  };
  
  const confirmDelete = () => {
    if (jadwalToDelete && firestore) {
        const jadwalDocRef = doc(firestore, 'jadwal', jadwalToDelete.id);
        deleteDocumentNonBlocking(jadwalDocRef);
        setJadwalToDelete(null);
    }
  };
  
  const getTeacherName = (guruId?: string) => {
    if (!guruId) return '...';
    return teachersMap.get(guruId)?.split(',')[0] || '...';
  }

  const handleExportPdf = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    const kelasTitle = selectedKelas === 'all' ? 'Semua Kelas' : `Kelas ${selectedKelas}`;
    const hariTitle = selectedHari === 'all' ? 'Semua Hari' : `Hari ${selectedHari}`;
    const title = `Jadwal Pelajaran - ${kelasTitle} (${hariTitle})`;
    doc.text(title, 20, 10);
    
    const head: any[] = [['Kelas', 'Hari', 'Jam', 'Pelajaran', 'Kitab', 'Guru']];
    const body: any[] = [];
    
    const dataToExport = (jadwal || [])
      .filter(item => {
        const kelasMatch = selectedKelas === 'all' || item.kelas === selectedKelas;
        const hariMatch = selectedHari === 'all' || item.hari === selectedHari;
        return kelasMatch && hariMatch;
      });

    dataToExport
      .sort((a,b) => Number(a.kelas) - Number(b.kelas) || HARI_OPERASIONAL.indexOf(a.hari) - HARI_OPERASIONAL.indexOf(b.hari) || a.jam.localeCompare(b.jam))
      .forEach(item => {
        const kurikulumItem = item.kurikulumId ? kurikulumMap.get(item.kurikulumId) : null;
        body.push([
          `Kelas ${item.kelas}`,
          item.hari,
          item.jam,
          kurikulumItem?.pelajaran || '',
          kurikulumItem?.kitab || '',
          getTeacherName(item.guruId)
        ]);
    });

    doc.autoTable({ head, body });
    doc.save(`jadwal-pelajaran.pdf`);
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
                <div key={hari} className="rounded-lg p-4 flex-shrink-0 w-48 bg-muted/30 shadow-inner">
                  <h3 className="font-headline text-lg font-bold text-center mb-4">{hari}</h3>
                  <div className="space-y-2">
                    {JAM_PELAJARAN.map(jam => {
                      const key = `${kelas}-${hari}-${jam}`;
                      const jadwalItem = jadwalByKelasHariJam[key];
                      const kurikulumItem = jadwalItem?.kurikulumId ? kurikulumMap.get(jadwalItem.kurikulumId) : null;
                      
                      return (
                        <div key={jam} className="border rounded-lg p-3 min-h-[90px] flex flex-col justify-between bg-card shadow-sm transition-shadow hover:shadow-md">
                          <p className="text-xs font-semibold text-muted-foreground">{jam}</p>
                          {jadwalItem ? (
                            <div className="mt-1">
                              <p className="font-bold text-sm text-primary truncate" title={kurikulumItem?.pelajaran}>{kurikulumItem?.pelajaran || ''}</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs truncate text-muted-foreground" title={teachersMap.get(jadwalItem.guruId)}>{getTeacherName(jadwalItem.guruId)}</p>
                                {isAdmin && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
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
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isAdmin && (
              <Button onClick={() => handleOpenDialog()} size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Jadwal
              </Button>
          )}
          <Button onClick={handleExportPdf} variant="outline" size="sm" disabled={!jadwal || jadwal.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              Ekspor PDF
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
            <Select value={selectedKelas} onValueChange={setSelectedKelas}>
              <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Pilih Kelas" />
              </SelectTrigger>
              <SelectContent>
                  {KELAS_OPTIONS.map(kelas => (
                      <SelectItem key={kelas} value={kelas}>
                          {kelas === 'all' ? 'Semua Kelas' : `Kelas ${kelas}`}
                      </SelectItem>
                  ))}
              </SelectContent>
            </Select>
        </div>
      </div>
      
      {isLoading ? (
         <p className="text-center mt-8">Memuat jadwal...</p>
      ) : (
         <div>
          {selectedKelas === 'all' ? (
            KELAS_OPTIONS.filter(k => k !== 'all').map(kelas => renderInteractiveGrid(kelas))
          ) : (!jadwal || jadwal.length === 0) && !isAdmin ? (
              <p className="text-center text-muted-foreground mt-8">Tidak ada jadwal untuk kelas ini.</p>
          ) : (
              renderInteractiveGrid(selectedKelas)
          )}
         </div>
      )}

      {isAdmin && (
        <>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{jadwalToEdit ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}</DialogTitle>
                <DialogDescription>
                  {jadwalToEdit ? 'Perbarui informasi jadwal di bawah ini.' : `Isi formulir untuk menambahkan jadwal baru.`}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                  <Label htmlFor="kelas">Kelas</Label>
                  <Select name="kelas" onValueChange={(value) => handleSelectChange('kelas', value)} value={formData.kelas}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      {KELAS_OPTIONS.filter(k => k !== 'all').map(kelas => (
                            <SelectItem key={kelas} value={kelas}>Kelas {kelas}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hari">Hari</Label>
                  <Select name="hari" onValueChange={(value) => handleSelectChange('hari', value)} value={formData.hari}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Hari" />
                    </SelectTrigger>
                    <SelectContent>
                      {HARI_OPERASIONAL.map(hari => (
                            <SelectItem key={hari} value={hari}>{hari}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jam">Jam</Label>
                  <Select name="jam" onValueChange={(value) => handleSelectChange('jam', value)} value={formData.jam}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Jam" />
                    </SelectTrigger>
                    <SelectContent>
                      {JAM_PELAJARAN.map(jam => (
                            <SelectItem key={jam} value={jam}>{jam}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kurikulumId">Mata Pelajaran</Label>
                  <Select name="kurikulumId" onValueChange={(value) => handleSelectChange('kurikulumId', value)} value={formData.kurikulumId}>
                    <SelectTrigger><SelectValue placeholder={'Pilih Mata Pelajaran'} /></SelectTrigger>
                    <SelectContent>
                      {kurikulum?.filter(k => k.kelas === formData.kelas).map((mapel) => (
                            <SelectItem key={mapel.id} value={mapel.id}>[{mapel.kode}] {mapel.mataPelajaran}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guruId">Guru</Label>
                  <Select name="guruId" onValueChange={(value) => handleSelectChange('guruId', String(value))} value={String(formData.guruId)}>
                    <SelectTrigger><SelectValue placeholder={'Pilih Guru'} /></SelectTrigger>
                    <SelectContent>
                      {teachers?.map(teacher => (
                            <SelectItem key={teacher.id} value={String(teacher.id)}>{teacher.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button type="submit" onClick={handleSaveJadwal}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog open={!!jadwalToDelete} onOpenChange={() => setJadwalToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Anda yakin ingin menghapus?</AlertDialogTitle>
                <AlertDialogDescription>
                  Jadwal untuk kelas {jadwalToDelete?.kelas} pada hari {jadwalToDelete?.hari} akan dihapus. Aksi ini tidak dapat dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
