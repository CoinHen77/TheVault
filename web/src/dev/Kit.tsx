import { useState, type ReactNode } from 'react';
import DoorDial from '../components/heist/DoorDial';
import Door from '../components/heist/Door';
import CapRing from '../components/heist/CapRing';
import Envelope from '../components/heist/Envelope';
import KeyBadge from '../components/heist/KeyBadge';
import Podium from '../components/heist/Podium';
import { ResultStamp, WaxSeal } from '../components/heist/Seals';
import Ticket, { TicketStat } from '../components/heist/Ticket';
import { Avatar } from '../components/ui';
import { COPY } from '../lib/copy';

/**
 * Dev-only component sheet for the Heist redesign (CLAUDE.md H1). Open
 * http://localhost:5173/#kit while `npm run dev` is running. Sample values are
 * made up and never touch Firestore.
 */
export default function Kit() {
  const [progress, setProgress] = useState(0.62);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-vault-gold">Heist kit</h1>
        <p className="text-sm text-vault-gold-soft/60">Every building block in each state. Sample data only.</p>
      </header>

      <Section title="Door">
        <div className="flex flex-wrap items-end gap-6">
          <Labeled label="closed">
            <Door state="closed" height={160} />
          </Labeled>
          <Labeled label="opening">
            <Door state="opening" height={160} />
          </Labeled>
          <Labeled label="open">
            <Door state="open" height={160} />
          </Labeled>
        </div>
      </Section>

      <Section title="DoorDial">
        <div className="flex flex-wrap items-center gap-6">
          <Labeled label={`closed · ${Math.round(progress * 100)}% to lock`}>
            <DoorDial progress={progress} />
          </Labeled>
          <Labeled label="open">
            <DoorDial progress={1} state="open" />
          </Labeled>
          <label className="flex flex-col gap-1 text-xs text-vault-gold-soft/60">
            Progress
            <input
              id="kit-progress"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </label>
        </div>
      </Section>

      <Section title="Ticket">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Labeled label="sealed (before lock)">
            <Ticket
              eyebrow="Ticket · Wk 06"
              title="Bears −2.5"
              subtitle="CHI @ CAR · Sun 1:00 PM ET"
              mark={<WaxSeal />}
              footer={
                <div className="flex justify-between">
                  <TicketStat label="Odds" value="−138" />
                  <TicketStat label="To win" value="+0.72u" tone="good" align="right" />
                </div>
              }
            />
          </Labeled>
          <Labeled label="graded win">
            <Ticket
              eyebrow="Ticket · Wk 06 · used in the Book"
              title="Bears −2.5"
              subtitle="CHI @ CAR"
              mark={<ResultStamp result="win" />}
              footer={
                <div className="flex justify-between">
                  <TicketStat label="Odds" value="−138" />
                  <TicketStat label="Result" value="+0.72u" tone="good" align="right" />
                </div>
              }
            />
          </Labeled>
          <Labeled label="graded loss (muted)">
            <Ticket
              eyebrow="Ticket · Wk 06"
              title="Olave 6+ receptions"
              subtitle="NO @ ATL"
              muted
              mark={<ResultStamp result="loss" />}
              footer={
                <div className="flex justify-between">
                  <TicketStat label="Odds" value="−174" />
                  <TicketStat label="Result" value="−1.00u" tone="bad" align="right" />
                </div>
              }
            />
          </Labeled>
          <Labeled label="pending, no footer">
            <Ticket title="Dallas −3" subtitle="Alex · DAL @ NYG" muted />
          </Labeled>
        </div>
      </Section>

      <Section title="Seals and stamps">
        <div className="flex flex-wrap items-center gap-6">
          <WaxSeal />
          <WaxSeal size={24} />
          <ResultStamp result="win" />
          <ResultStamp result="loss" />
          <ResultStamp result="push" />
          <ResultStamp result="win" size="sm" />
          <ResultStamp result="loss" size="sm" />
          <ResultStamp result="push" size="sm" />
          <span className="text-xs text-vault-gold-soft/50">(pending renders nothing)</span>
        </div>
      </Section>

      <Section title="Envelope">
        <div className="grid max-w-md grid-cols-3 gap-2">
          <Envelope name="You" sealed isYou />
          <Envelope name="Dana" sealed isKeyHolder />
          <Envelope name="Marcus" sealed />
          <Envelope name="Tori" sealed={false} />
          <Envelope name="Sam" sealed={false} isKeyHolder />
          <Envelope name="Alexandria Longname" sealed />
        </div>
      </Section>

      <Section title="Avatar and KeyBadge">
        <div className="flex max-w-md flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar name="Dana Kim" highlight />
            <Avatar name="Marcus" />
            <Avatar name="" />
            <KeyBadge name="Dana" />
          </div>
          <KeyBadge name="Dana" variant="row" />
        </div>
      </Section>

      <Section title="CapRing">
        <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
          <CapRing usedCents={0} capCents={9000} />
          <CapRing usedCents={4000} capCents={9000} />
          <CapRing usedCents={9000} capCents={9000} />
        </div>
      </Section>

      <Section title="Podium">
        <div className="grid max-w-3xl gap-6 sm:grid-cols-3">
          <Podium
            youId="p3"
            entries={[
              { id: 'p1', name: 'Dana', units: 3.15 },
              { id: 'p2', name: 'Marcus', units: 2.4 },
              { id: 'p3', name: 'Zach', units: 2.31 },
            ]}
          />
          <Podium
            entries={[
              { id: 'p1', name: 'Dana', units: 0.72 },
              { id: 'p2', name: 'Marcus', units: -1 },
            ]}
          />
          <Podium entries={[{ id: 'p1', name: 'Dana', units: 0 }]} />
        </div>
      </Section>

      <Section title="Wording (lib/copy.ts)">
        <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {Object.entries(COPY).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-xs text-vault-gold-soft/50">{k}</dt>
              <dd className="text-vault-gold-soft">{typeof v === 'string' ? v : Object.values(v).join(' · ')}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-vault-line pt-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {children}
      <span className="text-xs text-vault-gold-soft/50">{label}</span>
    </div>
  );
}
