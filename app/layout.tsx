import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Consulta RUI - Información Social',
  description: 'Sistema de consulta de información social del Registro Único de Información (RUI).',
  openGraph: {
    title: 'Consulta RUI',
    description: 'Sistema de consulta de información social.',
    type: 'website',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
