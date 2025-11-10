
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpRight, BookOpen, Users, UserCircle, GraduationCap } from 'lucide-react';
import { useCollection, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { motion } from 'framer-motion';

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.15,
      duration: 0.5,
      ease: 'easeOut',
    },
  }),
};


export default function DashboardPage() {
  const firestore = useFirestore();
  const { user } = useUser();

  const guruQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'gurus');
  }, [firestore, user]);
  const { data: teachers } = useCollection(guruQuery);
  
  const siswaAktifQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'siswa'), where('status', '==', 'Aktif'));
  }, [firestore, user]);
  const { data: activeStudents } = useCollection(siswaAktifQuery);

  const alumniQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'siswa'), where('status', '==', 'Lulus'));
  }, [firestore, user]);
  const { data: alumni } = useCollection(alumniQuery);
  
  const kurikulumQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'kurikulum');
  }, [firestore, user]);
  const { data: subjects } = useCollection(kurikulumQuery);

  const stats = [
    {
      title: 'Total Siswa Aktif',
      value: `${activeStudents?.length || 0} Siswa`,
      icon: UserCircle,
      href: '/siswa',
      description: 'Jumlah siswa aktif terdaftar',
    },
    {
      title: 'Total Guru',
      value: `${teachers?.length || 0} Pendidik`,
      icon: Users,
      href: '/guru',
      description: 'Jumlah tenaga pendidik profesional',
    },
    {
      title: 'Total Mata Pelajaran',
      value: `${subjects?.length || 0} Pelajaran`,
      icon: BookOpen,
      href: '/kurikulum',
      description: 'Jumlah mata pelajaran yang diajarkan',
    },
     {
      title: 'Total Alumni',
      value: `${alumni?.length || 0} Lulusan`,
      icon: GraduationCap,
      href: '/alumni',
      description: 'Jumlah alumni yang telah lulus',
    },
  ];

  return (
    <div className="bg-gray-50 dark:bg-gray-900 md:bg-background">
      <div className="container mx-auto max-w-5xl py-8 md:py-12">
        {/* Header */}
        <div className="mb-8 text-center">
             <h1 className="font-headline text-4xl md:text-5xl font-bold text-primary">Statistik Sekolah</h1>
             <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
                Ringkasan data terkini dari sistem informasi sekolah IBNU AHMAD APP.
             </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4 md:px-0">
          {stats.map((stat, index) => (
             <motion.div
              key={index}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="h-full"
            >
              <Card className="bg-card shadow-lg hover:shadow-xl transition-shadow rounded-2xl md:rounded-lg flex flex-col h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent className="flex flex-col flex-grow justify-between">
                  <div>
                      <div className="text-2xl font-bold text-primary">{stat.value}</div>
                      <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                  </div>
                  <Link href={stat.href} className="flex items-center gap-1 text-xs text-primary hover:underline mt-4">
                      Lihat Detail <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
