
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, BookMarked, UserCircle, GraduationCap, CalendarDays, FileText, ClipboardCheck, ChevronDown, ChevronUp, BookCopy, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/kurikulum', label: 'Kurikulum', icon: BookMarked },
  { href: '/guru', label: 'Guru', icon: Users },
  { href: '/siswa', label: 'Siswa', icon: UserCircle },
  { href: '/alumni', label: 'Alumni', icon: GraduationCap },
  { href: '/kelas', label: 'Kelas', icon: BookCopy },
  { href: '/jadwal', label: 'Jadwal', icon: CalendarDays },
  { href: '/nilai', label: 'Nilai', icon: ClipboardCheck },
  { href: '/raport', label: 'Raport', icon: FileText },
  { href: '/absensi', label: 'Absensi', icon: CheckSquare },
];

export function BottomNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);

  const topRowLinks = navLinks.slice(0, 5);
  const bottomRowLinks = navLinks.slice(5);

  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <motion.div
            initial={{ y: 0 }}
            animate={{ y: isVisible ? 0 : "100%" }}
            transition={{ type: "tween", duration: 0.3, ease: "easeInOut" }}
            className="relative"
        >
             <div className="relative flex justify-center">
                <Button
                    onClick={toggleVisibility}
                    variant="secondary"
                    className="absolute -top-7 h-8 w-12 rounded-t-lg rounded-b-none px-2 shadow-lg"
                    aria-label={isVisible ? "Sembunyikan Menu" : "Tampilkan Menu"}
                >
                    {isVisible ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </Button>
            </div>
            <div
                className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            >
                <nav className="grid grid-cols-5 h-16">
                    {topRowLinks.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            'flex flex-col items-center justify-center text-muted-foreground transition-colors w-full h-full pt-2 pb-1',
                            isActive ? 'text-primary' : 'hover:text-primary'
                        )}
                        >
                        <link.icon className="h-5 w-5 mb-1" />
                        <span className="text-[10px] text-center">{link.label}</span>
                        </Link>
                    );
                    })}
                </nav>
                <div className="flex justify-center border-t">
                    <nav className="grid grid-cols-5 h-16 w-full">
                        {bottomRowLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                'flex flex-col items-center justify-center text-muted-foreground transition-colors w-full h-full pt-2 pb-1',
                                isActive ? 'text-primary' : 'hover:text-primary'
                                )}
                            >
                                <link.icon className="h-5 w-5 mb-1" />
                                <span className="text-[10px] text-center">{link.label}</span>
                            </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>
        </motion.div>
    </div>
  );
}
