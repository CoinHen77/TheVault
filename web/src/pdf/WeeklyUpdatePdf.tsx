/**
 * The weekly update PDF ("the dispatch"), drawn with @react-pdf/renderer in
 * the Heist look. This module is only ever loaded with a dynamic import from
 * the Control room, so the library and fonts never touch the crew's app load.
 */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { PickResult, ReportBetRow, ReportPickRow, ReportStandingRow, WeeklyReport } from '@vault/shared';

/** Strings the caller formats (dates in America/New_York, labels from lib/format). */
export interface WeeklyUpdateMeta {
  seasonName: string;
  weekName: string;
  weekTypeLabel: string;
  closedAtText: string;
  keyReason: string;
  next: { weekName: string; opensAtText: string; buyInText: string } | null;
  generatedText: string;
  /** PNG data URL of the open vault door, or null if it couldn't be loaded. */
  doorPng: string | null;
}

const C = {
  black: '#060907',
  page: '#0a110d',
  panel: '#0e1510',
  panel2: '#111b15',
  line: '#1f2a22',
  green: '#0f3325',
  gold: '#d4af37',
  goldSoft: '#f0d98c',
  muted: '#9aa59c',
  dim: '#6b766e',
  win: '#6fcf8e',
  loss: '#e0735f',
  push: '#7fb3d9',
  steel: '#c3c8c4',
  brass: '#8a6d1f',
  wax: '#8f2a26',
};

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const src = (file: string) => `${window.location.origin}/fonts/${file}`;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: src('Inter-Regular.ttf'), fontWeight: 400 },
      { src: src('Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: src('Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Mono',
    fonts: [
      { src: src('JetBrainsMono-Regular.ttf'), fontWeight: 400 },
      { src: src('JetBrainsMono-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Playfair',
    fonts: [
      { src: src('PlayfairDisplay-Bold.ttf'), fontWeight: 700 },
      { src: src('PlayfairDisplay-Black.ttf'), fontWeight: 900 },
    ],
  });
  // Never split words across lines; pick text like "Kelce o6.5" reads badly hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const s = StyleSheet.create({
  page: { backgroundColor: C.page, color: C.goldSoft, fontFamily: 'Inter', fontSize: 10, paddingTop: 48, paddingBottom: 54, paddingHorizontal: 36 },
  running: { position: 'absolute', top: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, letterSpacing: 1.5, color: C.dim },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.dim, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: C.gold, fontWeight: 600 },
  h1: { fontFamily: 'Playfair', fontWeight: 900, fontSize: 54, color: C.gold, lineHeight: 1.15 },
  headline: { fontFamily: 'Playfair', fontWeight: 700, fontSize: 24, color: C.goldSoft, lineHeight: 1.15 },
  subhead: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 },
  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.brass, paddingBottom: 5, marginBottom: 10 },
  sectionTitle: { fontFamily: 'Playfair', fontWeight: 700, fontSize: 19, color: C.gold },
  sectionNote: { fontSize: 8.5, color: C.muted },
  mono: { fontFamily: 'Mono' },
  card: { backgroundColor: C.panel, borderWidth: 0.75, borderColor: C.line, borderRadius: 8 },
});

const RESULT_COLOR: Record<PickResult, string> = { win: C.win, loss: C.loss, push: C.push, pending: C.dim };
const RESULT_LABEL: Record<PickResult, string> = { win: 'WIN', loss: 'LOSS', push: 'PUSH', pending: '—' };

function money(cents: number, signed = false): string {
  const abs = `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (cents < 0) return `−${abs}`;
  return signed && cents > 0 ? `+${abs}` : abs;
}
const odds = (o: number) => (o > 0 ? `+${o}` : `−${Math.abs(o)}`);
const units = (u: number) => `${u > 0 ? '+' : u < 0 ? '−' : ''}${Math.abs(u).toFixed(2)}u`;
const tone = (n: number) => (n > 0 ? C.win : n < 0 ? C.loss : C.muted);

function Stamp({ result, size = 9 }: { result: PickResult; size?: number }) {
  const color = RESULT_COLOR[result];
  return (
    <View style={{ transform: 'rotate(-7deg)', borderWidth: 1.5, borderColor: color, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5 }}>
      <Text style={{ color, fontSize: size, fontWeight: 700, letterSpacing: 1.5 }}>{RESULT_LABEL[result]}</Text>
    </View>
  );
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1.5, marginLeft: 5 }}>
      <Text style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 1, color }}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <View style={[s.card, { flex: 1, padding: 10 }]}>
      <Text style={{ fontSize: 7, letterSpacing: 1.5, color: C.muted, fontWeight: 600 }}>{label}</Text>
      <Text style={[s.mono, { fontSize: 17, fontWeight: 700, color: C.goldSoft, marginTop: 4 }]}>{value}</Text>
      <Text style={[s.mono, { fontSize: 8, color: subColor, marginTop: 2 }]}>{sub}</Text>
    </View>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <View style={s.sectionHead} minPresenceAhead={60}>
      <Text style={s.sectionTitle}>{title}</Text>
      {note ? <Text style={s.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function TicketRow({ p }: { p: ReportPickRow }) {
  return (
    <View wrap={false} style={[s.card, { flexDirection: 'row', marginBottom: 6, overflow: 'hidden' }]}>
      <View style={{ width: 5, backgroundColor: RESULT_COLOR[p.result] }} />
      <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.muted }}>{p.name.toUpperCase()}</Text>
          {p.getsKey ? <Pill label="GETS THE KEY" bg={C.gold} color={C.black} /> : null}
          {p.inBook ? <Pill label="IN THE BOOK" bg={C.green} color={C.goldSoft} /> : null}
        </View>
        <Text style={{ fontFamily: 'Playfair', fontWeight: 700, fontSize: 14, color: C.goldSoft, marginTop: 2 }}>{p.pickText}</Text>
        <Text style={{ fontSize: 8, color: C.dim, marginTop: 1 }}>
          {p.gameText}
          {p.sealedText ? `  ·  sealed ${p.sealedText}, priced at vault open` : ''}
        </Text>
      </View>
      <View style={{ width: 70, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 6.5, color: C.dim, letterSpacing: 1 }}>ODDS</Text>
        <Text style={[s.mono, { fontSize: 11, color: C.goldSoft, marginTop: 1 }]}>{odds(p.americanOdds)}</Text>
      </View>
      <View style={{ width: 62, justifyContent: 'center', alignItems: 'center' }}>
        <Stamp result={p.result} />
      </View>
      <View style={{ width: 66, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 12 }}>
        <Text style={[s.mono, { fontSize: 14, fontWeight: 700, color: tone(p.units) }]}>{units(p.units)}</Text>
      </View>
    </View>
  );
}

function BetCard({ b, index }: { b: ReportBetRow; index: number }) {
  return (
    <View wrap={false} style={[s.card, { padding: 12, marginBottom: 8, borderColor: b.result === 'win' ? C.brass : C.line }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 8, letterSpacing: 1.5, color: C.gold, fontWeight: 600 }}>
          BET {index + 1} · {b.legs.length === 1 ? 'STRAIGHT' : `${b.legs.length}-LEG PARLAY`}
        </Text>
        <Stamp result={b.result} size={10} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          {b.legs.map((leg, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: RESULT_COLOR[leg.result], marginRight: 6 }} />
              <Text style={{ fontSize: 10, color: C.goldSoft }}>{leg.pickText}</Text>
              <Text style={{ fontSize: 8, color: C.dim, marginLeft: 6 }}>{leg.name}</Text>
            </View>
          ))}
        </View>
        <View style={{ width: 170, flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            ['STAKE', money(b.stakeCents)],
            ['TICKET', odds(b.ticketOdds)],
            ['NET', money(b.netCents, true)],
          ].map(([label, value], i) => (
            <View key={label} style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 6.5, color: C.dim, letterSpacing: 1 }}>{label}</Text>
              <Text style={[s.mono, { fontSize: i === 2 ? 13 : 10, fontWeight: i === 2 ? 700 : 400, color: i === 2 ? tone(b.netCents) : C.goldSoft, marginTop: 2 }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Podium({ top }: { top: ReportStandingRow[] }) {
  // 2nd, 1st, 3rd, like the Sharp screen.
  const order = [top[1], top[0], top[2]];
  const heights = [62, 86, 46] as const;
  const colors = [C.steel, C.gold, '#b07a3a'] as const;
  const places = ['2ND', '1ST', '3RD'] as const;
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 12 }}>
      {order.map((r, i) =>
        r ? (
          <View key={r.playerId} style={{ width: 150, alignItems: 'center', marginHorizontal: 6 }}>
            <Text style={{ fontFamily: 'Playfair', fontWeight: 700, fontSize: 13, color: C.goldSoft }}>{r.name}</Text>
            <Text style={[s.mono, { fontSize: 10, color: tone(r.units), marginTop: 2, marginBottom: 5 }]}>{units(r.units)}</Text>
            <View style={{ width: '100%', height: heights[i]!, backgroundColor: C.panel2, borderTopWidth: 3, borderTopColor: colors[i]!, borderTopLeftRadius: 4, borderTopRightRadius: 4, alignItems: 'center', paddingTop: 8 }}>
              <Text style={{ fontFamily: 'Playfair', fontWeight: 900, fontSize: 18, color: colors[i]! }}>{places[i]}</Text>
              {i === 1 ? <Text style={{ fontSize: 6.5, letterSpacing: 1.5, color: C.gold, marginTop: 2 }}>THE SHARP, FOR NOW</Text> : null}
            </View>
          </View>
        ) : (
          <View key={i} style={{ width: 150, marginHorizontal: 6 }} />
        ),
      )}
    </View>
  );
}

const COLS = [
  { label: '#', w: 22, align: 'left' as const },
  { label: 'MOVE', w: 38, align: 'left' as const },
  { label: 'PLAYER', w: 0, align: 'left' as const },
  { label: 'W-L-P', w: 56, align: 'right' as const },
  { label: 'UNITS', w: 56, align: 'right' as const },
  { label: 'WKS', w: 32, align: 'right' as const },
  { label: 'SHARES', w: 56, align: 'right' as const },
  { label: 'VALUE', w: 68, align: 'right' as const },
];

function StandingsTable({ rows }: { rows: ReportStandingRow[] }) {
  const cell = (i: number) => {
    const col = COLS[i]!;
    return col.w ? { width: col.w, textAlign: col.align } : { flex: 1, textAlign: col.align };
  };
  return (
    <View style={[s.card, { paddingHorizontal: 10, paddingVertical: 6 }]}>
      <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.75, borderBottomColor: C.line }}>
        {COLS.map((c, i) => (
          <Text key={c.label} style={[cell(i), { fontSize: 6.5, letterSpacing: 1, color: C.dim, fontWeight: 600 }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, idx) => {
        const move = r.prevRank === null ? 'NEW' : r.prevRank > r.rank ? `↑${r.prevRank - r.rank}` : r.prevRank < r.rank ? `↓${r.rank - r.prevRank}` : '–';
        const moveColor = r.prevRank === null ? C.gold : r.prevRank > r.rank ? C.win : r.prevRank < r.rank ? C.loss : C.dim;
        return (
          <View
            key={r.playerId}
            wrap={false}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: idx === rows.length - 1 ? 0 : 0.5, borderBottomColor: C.line, ...(idx === 0 ? { backgroundColor: '#1a1708' } : {}) }}
          >
            <Text style={[cell(0), s.mono, { fontSize: 9, color: idx === 0 ? C.gold : C.muted }]}>{r.rank}</Text>
            <Text style={[cell(1), s.mono, { fontSize: 8.5, color: moveColor }]}>{move}</Text>
            <Text style={[cell(2), { fontSize: 10, color: C.goldSoft, fontWeight: idx === 0 ? 700 : 400 }]}>{r.name}</Text>
            <Text style={[cell(3), s.mono, { fontSize: 9, color: C.muted }]}>{`${r.wins}-${r.losses}-${r.pushes}`}</Text>
            <Text style={[cell(4), s.mono, { fontSize: 9.5, fontWeight: 700, color: tone(r.units) }]}>{units(r.units)}</Text>
            <Text style={[cell(5), s.mono, { fontSize: 9, color: C.muted }]}>{r.weeksBoughtIn}</Text>
            <Text style={[cell(6), s.mono, { fontSize: 9, color: C.muted }]}>{r.shares.toFixed(2)}</Text>
            <Text style={[cell(7), s.mono, { fontSize: 9.5, color: C.goldSoft }]}>{money(r.valueCents)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const AWARD_COLORS = [C.gold, C.win, C.push, C.wax];

function WeeklyUpdateDocument({ report: r, meta }: { report: WeeklyReport; meta: WeeklyUpdateMeta }) {
  const vaultChange = r.vault.closingCents - r.vault.openingCents;
  return (
    <Document title={`The Vault · ${meta.weekName} update`} author="The Vault" subject={meta.seasonName}>
      <Page size="LETTER" style={s.page}>
        <View style={s.running} fixed>
          <Text>{`THE VAULT  ·  ${meta.weekName.toUpperCase()} DISPATCH`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

        {/* Cover */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.eyebrow}>{`THE WEEKLY DISPATCH  ·  ${meta.seasonName.toUpperCase()}`}</Text>
            <Text style={[s.h1, { marginTop: 8 }]}>{meta.weekName}</Text>
            <Text style={{ fontSize: 9, color: C.muted, marginTop: 2, letterSpacing: 1 }}>
              {`${meta.weekTypeLabel.toUpperCase()}  ·  CLOSED ${meta.closedAtText.toUpperCase()}`}
            </Text>
            <Text style={[s.headline, { marginTop: 16 }]}>{r.headline}</Text>
            <Text style={s.subhead}>{r.subhead}</Text>
          </View>
          {meta.doorPng ? (
            <View style={{ width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: C.gold, padding: 6, backgroundColor: C.black }}>
              <Image src={meta.doorPng} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          <Stat
            label="THE VAULT"
            value={money(r.vault.closingCents)}
            sub={`${money(vaultChange, true)} this week`}
            subColor={tone(vaultChange)}
          />
          <Stat
            label="SHARE PRICE"
            value={`$${r.vault.sharePriceAfter.toFixed(2)}`}
            sub={`${r.vault.sharePricePct > 0 ? '+' : r.vault.sharePricePct < 0 ? '−' : ''}${Math.abs(r.vault.sharePricePct).toFixed(1)}% from $${r.vault.sharePriceBefore.toFixed(2)}`}
            subColor={tone(r.vault.sharePricePct)}
          />
          <Stat
            label="THE BOOK"
            value={money(r.vault.bookNetCents, true)}
            sub={r.bets.length ? `${money(r.stakedCents)} on ${r.bets.length} bet${r.bets.length === 1 ? '' : 's'}` : 'No bets placed'}
            subColor={C.muted}
          />
          <Stat label="CREW RECORD" value={`${r.record.w}-${r.record.l}-${r.record.p}`} sub="W-L-P" subColor={C.muted} />
        </View>

        {/* The key */}
        <View wrap={false} style={{ marginTop: 14, backgroundColor: C.gold, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
            <Text style={{ fontFamily: 'Playfair', fontWeight: 900, fontSize: 20, color: C.gold }}>K</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, letterSpacing: 2, fontWeight: 700, color: C.black }}>THE KEY GOES TO</Text>
            <Text style={{ fontFamily: 'Playfair', fontWeight: 900, fontSize: 24, color: C.black, marginTop: 1 }}>{r.key.name}</Text>
            <Text style={{ fontSize: 9, color: '#3a2f0b', marginTop: 2 }}>{`${meta.keyReason} They run the Book next week.`}</Text>
          </View>
        </View>

        {/* Awards */}
        {r.awards.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -4 }}>
            {r.awards.map((a, i) => (
              <View key={a.key} wrap={false} style={{ width: '50%', padding: 4 }}>
                <View style={[s.card, { padding: 10, borderLeftWidth: 4, borderLeftColor: AWARD_COLORS[i % AWARD_COLORS.length]! }]}>
                  <Text style={{ fontSize: 7.5, letterSpacing: 1.5, fontWeight: 700, color: AWARD_COLORS[i % AWARD_COLORS.length]! }}>
                    {a.title.toUpperCase()}
                  </Text>
                  <Text style={{ fontFamily: 'Playfair', fontWeight: 700, fontSize: 14, color: C.goldSoft, marginTop: 3 }}>{a.name}</Text>
                  <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>{a.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Tickets start page 2, so the cover stays a cover. */}
        <View style={s.section} break>
          <SectionHead title="The tickets" note={`${r.picks.length} picks  ·  crew went ${r.record.w}-${r.record.l}-${r.record.p}`} />
          {r.picks.map((p) => (
            <TicketRow key={p.playerId} p={p} />
          ))}
        </View>

        {/* Book */}
        <View style={s.section}>
          <SectionHead
            title="The Book"
            note={`Key holder ${r.bookholder.name}  ·  ${money(r.stakedCents)} staked  ·  net ${money(r.vault.bookNetCents, true)}`}
          />
          {r.bets.length === 0 ? (
            <Text style={{ fontSize: 10, color: C.muted }}>No bets this week. The Vault held its ground.</Text>
          ) : (
            r.bets.map((b, i) => <BetCard key={b.id} b={b} index={i} />)
          )}
        </View>

        {/* Standings */}
        <View style={s.section}>
          {/* Keep the heading with the podium so it never sits alone at a page bottom. */}
          <View wrap={false}>
            <SectionHead title="The Sharp race" note={`Standings after ${meta.weekName}  ·  value at $${r.vault.sharePriceAfter.toFixed(2)} a share`} />
            {r.standings.length >= 3 ? <Podium top={r.standings.slice(0, 3)} /> : null}
          </View>
          <StandingsTable rows={r.standings} />
        </View>

        {/* Next up */}
        {r.next && meta.next ? (
          <View wrap={false} style={[s.section, s.card, { padding: 16, borderColor: C.brass, borderWidth: 1.25, alignItems: 'center' }]}>
            <Text style={s.eyebrow}>NEXT UP</Text>
            <Text style={{ fontFamily: 'Playfair', fontWeight: 900, fontSize: 26, color: C.gold, marginTop: 4 }}>{meta.next.weekName}</Text>
            <Text style={{ fontSize: 10, color: C.goldSoft, marginTop: 6, textAlign: 'center' }}>
              {`The vault opens ${meta.next.opensAtText}  ·  Buy-in ${meta.next.buyInText}  ·  Key holder ${r.next.keyHolderName}`}
            </Text>
            <Text style={{ fontFamily: 'Playfair', fontWeight: 700, fontSize: 15, color: C.goldSoft, marginTop: 10 }}>
              Buy in. Seal it. Take the key.
            </Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>The Vault is a ledger and scoreboard. No money moves through the app.</Text>
          <Text>{`Generated ${meta.generatedText}`}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Draws the weekly update and returns it as a PDF blob. */
export async function renderWeeklyUpdatePdf(report: WeeklyReport, meta: WeeklyUpdateMeta): Promise<Blob> {
  registerFonts();
  return pdf(<WeeklyUpdateDocument report={report} meta={meta} />).toBlob();
}
