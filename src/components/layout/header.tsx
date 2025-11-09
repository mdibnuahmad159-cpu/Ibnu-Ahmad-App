
'use client';

import Link from 'next/link';
import { LogIn, LogOut, Menu, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { useAdmin } from '@/context/AdminProvider';
import { useToast } from '@/hooks/use-toast';
import { ModeToggle } from '../mode-toggle';


const navLinks = [
  { href: '/', label: 'Dasbor' },
  { href: '/guru', label: 'Data Guru' },
  { href: '/siswa', label: 'Data Siswa' },
  { href: '/alumni', label: 'Data Alumni' },
  { href: '/kurikulum', label: 'Kurikulum' },
  { href: '/jadwal', label: 'Jadwal' },
  { href: '/kelas', label: 'Kelas' },
  { href: '/raport', label: 'Raport' },
  { href: '/nilai', label: 'Nilai' },
  { href: '/absensi', label: 'Absensi' },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const pathname = usePathname();
  const { isAdmin, login, logout } = useAdmin();
  const { toast } = useToast();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) {
      toast({ title: 'Login berhasil!', description: 'Anda sekarang memiliki akses admin.' });
      setIsLoginDialogOpen(false);
      setPassword('');
    } else {
      toast({
        variant: 'destructive',
        title: 'Login Gagal',
        description: 'Kata sandi yang Anda masukkan salah.',
      });
      setPassword('');
    }
  };


  const renderAuthButton = () => {
    if (isAdmin) {
      return (
        <Button onClick={logout} size="sm" variant="ghost">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      );
    }
    return (
      <div className="flex gap-2">
        <Button onClick={() => setIsLoginDialogOpen(true)} size="sm" variant="outline">
          <LogIn className="mr-2 h-4 w-4" />
          Login Admin
        </Button>
        <Button asChild size="sm">
          <Link href="/pendaftaran">
            <UserCircle className="mr-2 h-4 w-4" />
            Pendaftaran
          </Link>
        </Button>
      </div>
    );
  };
  
  const renderMobileAuthButton = () => {
     if (isAdmin) {
      return (
        <Button onClick={() => { logout(); setIsOpen(false);}} size="lg" className="mt-8 w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
        </Button>
      );
    }
    return (
      <>
        <Button onClick={() => { setIsLoginDialogOpen(true); setIsOpen(false); }} size="lg" variant="outline" className="mt-8 w-full">
          <LogIn className="mr-2 h-4 w-4" />
          Login Admin
        </Button>
        <Button asChild size="lg" className="mt-4 w-full bg-gradient-primary hover:brightness-110">
            <Link href="/pendaftaran" onClick={() => setIsOpen(false)}>Daftar Sekarang</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Desktop Header */}
        <div className="container hidden h-16 items-center justify-between md:flex">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-headline text-xl font-bold text-primary sr-only md:not-sr-only">IBNU AHMAD APP</span>
            </Link>
            <nav className="flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-primary',
                    pathname === link.href ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          
          <div className="hidden md:flex items-center gap-2">
            <ModeToggle />
            {renderAuthButton()}
          </div>
        </div>

        {/* Mobile Header */}
        <div className="container flex h-16 items-center justify-between md:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <SheetHeader>
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <SheetDescription className="sr-only">
                  Navigasi utama situs. Pilih tautan untuk berpindah ke halaman lain.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col p-6">
                <Link href="/" className="mb-8 flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <span className="font-headline text-xl font-bold text-primary">IBNU AHMAD APP</span>
                </Link>
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'text-lg font-medium transition-colors hover:text-primary',
                        pathname === link.href ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="mt-auto pt-8">
                  {renderMobileAuthButton()}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          
          <div className="font-headline text-xl font-bold text-primary">
            IBNU AHMAD APP
          </div>

          <ModeToggle />
        </div>
      </header>

      <Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
        <DialogContent className="sm:max-w-md">
           <DialogHeader>
            <DialogTitle className="text-2xl font-headline">Akses Admin</DialogTitle>
            <DialogDescription>Masukkan kata sandi untuk mengelola data.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin}>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsLoginDialogOpen(false)}>Batal</Button>
                <Button type="submit">Masuk</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
