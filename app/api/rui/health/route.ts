import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'RUI API',
    environment: process.env.NODE_ENV || 'production'
  });
}
