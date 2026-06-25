import { ENV } from '../_core/env';

export interface PatentLandscape {
  patents: Array<{
    patentNumber: string;
    title: string;
    assignee: string;
    expirationDate: string;
    status: string;
  }>;
  ftoStatus: 'CLEAR' | 'RISK' | 'BLOCKED' | 'UNKNOWN';
  nearestExpiration?: string;
  totalBlockingPatents: number;
}

export async function fetchPatentLandscape(gene: string): Promise<PatentLandscape> {
  try {
    const response = await fetch(
      `https://hivprotease-eq9ltmms.manus.space/v1/patents/search/${encodeURIComponent(gene)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ENV.notusApiKey ? `Bearer ${ENV.notusApiKey}` : '',
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      console.warn(`[notus] API error: ${response.status}`);
      return { patents: [], ftoStatus: 'UNKNOWN', totalBlockingPatents: 0 };
    }

    const data = await response.json();
    const patents = data.results || [];

    if (patents.length === 0) {
      return { patents: [], ftoStatus: 'UNKNOWN', totalBlockingPatents: 0 };
    }

    const now = new Date();
    const active = patents.filter(
      (p: any) => p.status !== 'abandoned' && new Date(p.expirationDate) > now
    );

    const blocking = active.length;
    const ftoStatus: PatentLandscape['ftoStatus'] =
      blocking === 0 ? 'CLEAR' :
      blocking >= 5 ? 'BLOCKED' : 'RISK';

    return {
      patents: active.slice(0, 5),
      ftoStatus,
      totalBlockingPatents: blocking,
      nearestExpiration: active.sort((a: any, b: any) =>
        new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()
      )[0]?.expirationDate,
    };
  } catch {
    return { patents: [], ftoStatus: 'UNKNOWN', totalBlockingPatents: 0 };
  }
}
