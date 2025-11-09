
'use client';

import React from 'react';
import AbsenGuru from './AbsenGuru';
import AbsenSiswa from './AbsenSiswa';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function AbsensiPage() {
  return (
    <div className="bg-background pb-32 md:pb-0">
      <div className="container py-12 md:py-20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="text-center sm:text-left">
            <h1 className="font-headline text-4xl md:text-5xl font-bold text-primary">
              Manajemen Absensi
            </h1>
            <p className="mt-4 max-w-2xl mx-auto sm:mx-0 text-lg text-muted-foreground">
              Catat kehadiran guru dan siswa setiap hari.
            </p>
          </div>
        </div>
        
        <Tabs defaultValue="guru" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="guru">Absen Guru</TabsTrigger>
            <TabsTrigger value="siswa">Absen Siswa</TabsTrigger>
          </TabsList>
          <TabsContent value="guru" className="mt-6">
             <AbsenGuru />
          </TabsContent>
          <TabsContent value="siswa" className="mt-6">
            <AbsenSiswa />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
