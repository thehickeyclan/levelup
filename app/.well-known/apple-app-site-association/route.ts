import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

/** Universal Links for Guild iPhone app — Apple requires application/json. */
export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      'public',
      '.well-known',
      'apple-app-site-association'
    );
    const body = await readFile(filePath, 'utf8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json(
      {
        applinks: {
          apps: [],
          details: [
            {
              appID: 'TEAMID.com.wrestlingguild.app',
              paths: ['/book/*', '/bookings*', '/notifications', '/market/*', '/messages/*', '/inbox*'],
            },
          ],
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}
