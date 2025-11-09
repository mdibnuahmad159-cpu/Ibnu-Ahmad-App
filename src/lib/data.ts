
// This file is no longer the primary source of truth.
// Data is now fetched from and managed in Firebase Firestore.
// The types are kept for reference and type safety in components.

export type Guru = {
  id: string; // Document ID from Firestore
  name: string;
  position: string;
  whatsapp: string;
  imageId: string | null;
};

export type Siswa = {
  id: string; // Document ID from Firestore (using nis)
  nama: string;
  nis: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  tempatLahir: string;
  tanggalLahir: string;
  namaAyah: string;
  namaIbu: string;
  alamat: string;
  fileDokumen: string;
  status: 'Aktif' | 'Lulus' | 'Pindah';
  kelas: number;
  tahunLulus?: number;
};

export type Kurikulum = {
  id: string; // Document ID from Firestore
  kode: string;
  kelas: string;
  mataPelajaran: string;
  kitab: string;
};

export type Jadwal = {
  id: string; // Document ID from Firestore
  hari: string;
  kelas: string;
  jam: string;
  guruId: string;
  kurikulumId: string;
};

export type JadwalUjian = {
  id: string;
  hari: string;
  tanggal: string;
  jam: string;
  mataPelajaran: string;
  guruId: string;
  kelas: string;
  guruName: string;
  kitab: string;
  kurikulumId?: string;
};


export type RaportFile = {
  [key: string]: string | null; // e.g., 'kelas_0_ganjil': 'gs://bucket/path/to/file.pdf'
};

export type Raport = {
  id: string; // Document ID from Firestore (using nis)
  nis: string;
  raports: RaportFile;
};

export type Nilai = {
    id: string; // Document ID from Firestore
    siswaId: string; // Reference to Siswa ID
    kurikulumId: string; // Reference to Kurikulum ID
    kelas: number;
    semester: 'ganjil' | 'genap';
    nilai: number;
};

export type AbsensiGuru = {
  id: string;
  jadwalId: string;
  guruId: string;
  tanggal: string; // YYYY-MM-DD
  status: 'Hadir' | 'Izin' | 'Sakit' | 'Alpha';
  keterangan?: string;
}

export type AbsensiSiswa = {
  id: string;
  jadwalId: string;
  siswaId: string;
  tanggal: string; // YYYY-MM-DD
  status: 'Hadir' | 'Izin' | 'Sakit' | 'Alpha';
  keterangan?: string;
  kelas: number;
}

    