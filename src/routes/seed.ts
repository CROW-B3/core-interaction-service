import type { Environment } from '../types';
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Environment }>();

// Retail-store CCTV scenario data — 6 sessions across today, realistic observations
const SCENARIOS = [
  // Morning opening
  {
    offsetHours: -10,
    periods: [
      {
        people: [
          {
            description:
              'Male employee, early 20s, black polo with store logo, lanyard',
            location: 'Tile 0,0 — entrance',
            activity: 'Unlocking front glass doors, turning on overhead lights',
          },
          {
            description:
              'Female employee, late 20s, same uniform, hair tied back',
            location: 'Tile 0,1 — register area',
            activity: 'Powering on POS terminals, arranging receipt paper',
          },
        ],
        interactions: [
          'Both employees greeted each other near entrance before splitting to tasks',
        ],
        movement_patterns: [
          'Employee 1 moved from entrance → stockroom (Tile 0,0 → off-frame)',
          'Employee 2 stayed stationary at register',
        ],
        notable_events: [
          'Store opening procedure initiated — lights turned on at 08:02',
        ],
        summary:
          'Two staff members opened the store. Lights on, registers booted, displays being arranged.',
      },
      {
        people: [
          {
            description: 'Male employee from earlier',
            location: 'Tile 0,0 — floor area',
            activity: 'Straightening shoe displays on wall racks',
          },
          {
            description: 'Female employee from earlier',
            location: 'Tile 0,1 — register',
            activity: 'Counting cash drawer',
          },
        ],
        interactions: [],
        movement_patterns: [
          'Employee 1 working systematically left-to-right along display wall',
        ],
        notable_events: [
          'No customers yet — pre-opening merchandising in progress',
        ],
        summary:
          'Continued pre-open prep. Shoe displays organized, cash drawers counted. Store not yet open to public.',
      },
    ],
  },
  // Late morning — first customers
  {
    offsetHours: -8,
    periods: [
      {
        people: [
          {
            description: 'Young couple, early 20s, casual streetwear',
            location: 'Tile 0,0 — sneaker wall',
            activity:
              'Browsing running shoes, picking up and examining several pairs',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — approaching couple',
            activity: 'Walking toward customers with greeting posture',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Idle at register, watching floor',
          },
        ],
        interactions: [
          'Employee approached couple and gestured toward a specific section of running shoes',
          'Couple spoke briefly then male customer pointed at a shoe on high shelf',
        ],
        movement_patterns: [
          'Customers entered from left side of Tile 0,0, moved toward sneaker wall',
          'Employee crossed floor from center to sneaker wall',
        ],
        notable_events: [
          'First customers of the day entered at approximately 10:14',
        ],
        summary:
          'First customers arrived — young couple browsing running shoes. Staff engaged proactively.',
      },
      {
        people: [
          {
            description: 'Male from couple',
            location: 'Tile 0,0 — seating area',
            activity: 'Trying on pair of gray running shoes',
          },
          {
            description: 'Female from couple',
            location: 'Tile 0,0 — display wall',
            activity: "Browsing women's section independently",
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — near seating',
            activity: 'Returning from stockroom with additional shoe box',
          },
          {
            description:
              'Older woman, 50s, business casual, carrying large tote bag',
            location: 'Tile 0,0 — entrance',
            activity: 'Just entering store, looking around',
          },
        ],
        interactions: [
          'Employee brought requested size from stockroom to seated male customer',
          'New customer entered and looked toward register area — no one greeted yet',
        ],
        movement_patterns: [
          'Employee made stockroom round-trip (off-frame → seating area)',
          "New customer hovering near entrance, hasn't moved deeper into store",
        ],
        notable_events: [
          'Third customer arrived while employee engaged with couple — slight service gap',
        ],
        summary:
          'Couple trying shoes, new customer entered ungreeted. Employee busy with stockroom run.',
      },
      {
        people: [
          {
            description: 'Male from couple',
            location: 'Tile 0,1 — register',
            activity: 'Paying for shoes, wallet out',
          },
          {
            description: 'Female from couple',
            location: 'Tile 0,1 — near register',
            activity: 'Waiting, looking at accessories display',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Scanning barcode, processing sale',
          },
          {
            description: 'Older woman',
            location: 'Tile 0,0 — casual shoes section',
            activity: 'Examining slip-on shoes, checking price tags',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — approaching older woman',
            activity: 'Walking toward customer',
          },
        ],
        interactions: [
          'Sale in progress at register for the couple',
          'Male employee now engaging with older customer who had been unassisted',
        ],
        movement_patterns: [
          'Couple moved from seating → register (purchase flow)',
          'Older woman browsed from entrance → casual section over ~5min',
        ],
        notable_events: ['First sale of the day completed — running shoes'],
        summary:
          'First sale completed (running shoes). Older customer now being assisted after brief wait.',
      },
    ],
  },
  // Midday — busy period
  {
    offsetHours: -6,
    periods: [
      {
        people: [
          {
            description:
              'Group of 3 teenage boys, school uniforms partially visible',
            location: 'Tile 0,0 — basketball shoe section',
            activity: 'Loudly browsing, trying shoes on without sitting down',
          },
          {
            description: 'Woman, 30s, athleisure, with stroller',
            location: 'Tile 0,0 — entrance area',
            activity: 'Navigating stroller through display tables',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — near teens',
            activity: 'Monitoring group while offering help',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Restocking bags under counter',
          },
        ],
        interactions: [
          'Teens declined help from employee, continued browsing independently',
          'Stroller customer briefly blocked by narrow aisle between display tables',
        ],
        movement_patterns: [
          'Teens circling the basketball section as a group',
          'Stroller customer rerouted to wider aisle after initial path blocked',
        ],
        notable_events: [
          'Stroller navigation difficulty suggests display table spacing too narrow on north aisle',
        ],
        summary:
          'Midday traffic picking up. Group of teens browsing basketball shoes. Mother with stroller had aisle navigation issues.',
      },
      {
        people: [
          {
            description: 'Teenage boys (now 2 visible, 1 may have left frame)',
            location: 'Tile 0,0 — seating area',
            activity: 'One trying on basketball shoes, other watching',
          },
          {
            description: 'Woman with stroller',
            location: "Tile 0,1 — women's casual section",
            activity: 'Examining sandals one-handed while holding stroller',
          },
          {
            description: 'Two men, 40s, suits, appeared together',
            location: 'Tile 0,0 — dress shoes',
            activity: 'Browsing formal shoes, discussing options',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — between groups',
            activity:
              'Assisting suited customers, glancing at teens periodically',
          },
          {
            description: 'Female employee',
            location: "Tile 0,1 — women's section",
            activity: 'Approaching stroller customer with shoe box',
          },
        ],
        interactions: [
          'Employee providing size options to suited customers',
          'Female employee proactively brought size options to stroller customer',
        ],
        movement_patterns: [
          'Store at 6 simultaneous customers — highest so far today',
          'Employee splitting attention between 2 customer groups',
        ],
        notable_events: [
          'Peak concurrent customers for the morning: 6 people on floor simultaneously',
        ],
        summary:
          'Peak midday traffic — 6 customers simultaneously. Staff managing multiple groups effectively.',
      },
    ],
  },
  // Afternoon — incident
  {
    offsetHours: -4,
    periods: [
      {
        people: [
          {
            description: 'Man, 30s, hoodie, backpack, sunglasses indoors',
            location: 'Tile 0,0 — high-value sneaker display',
            activity:
              'Closely examining limited-edition shoes, looking around frequently',
          },
          {
            description: 'Female customer, 20s, gym clothes',
            location: 'Tile 0,0 — running section',
            activity: 'Normal browsing, trying on shoes',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,1 — stockroom doorway',
            activity: 'Emerging from stockroom with boxes',
          },
        ],
        interactions: [],
        movement_patterns: [
          'Hooded man circled the limited-edition display twice in 2 minutes',
          'Other customer following normal browse pattern',
        ],
        notable_events: [
          'Individual near high-value display exhibiting surveillance-aware behavior — frequent glancing at cameras and staff positions',
        ],
        summary:
          'Suspicious behavior observed near limited-edition display. Individual appears camera-aware. Staff not yet alerted.',
      },
      {
        people: [
          {
            description: 'Same hooded man',
            location: 'Tile 0,0 — moved to exit-adjacent display',
            activity:
              'Positioned near exit with clear path, still examining shoes',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — approaching hooded man',
            activity: 'Casually walking toward individual, offering assistance',
          },
          {
            description: 'Female customer',
            location: 'Tile 0,1 — register',
            activity: 'Making a purchase',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Processing sale',
          },
        ],
        interactions: [
          'Employee engaged suspicious individual in conversation — individual appeared hesitant but stayed',
          'Register sale proceeding normally for gym customer',
        ],
        movement_patterns: [
          'Hooded individual repositioned closer to exit over past 5 minutes',
          'Employee intercepted path between individual and exit naturally',
        ],
        notable_events: [
          'Staff intervention prevented potential walkout — employee positioned between suspicious individual and exit while maintaining non-confrontational posture',
        ],
        summary:
          'Employee strategically engaged suspicious individual near exit. Potential loss prevention situation handled professionally.',
      },
      {
        people: [
          {
            description: 'Hooded man',
            location: 'Tile 0,0 — exit',
            activity: 'Leaving store without merchandise, normal pace',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — near exit',
            activity: 'Watching individual leave, then returning to floor',
          },
        ],
        interactions: [
          'Brief exchange at exit — individual declined further help and left',
        ],
        movement_patterns: [
          'Individual exited at normal walking pace — no running or alarm trigger',
        ],
        notable_events: [
          'Suspicious individual left without incident. No merchandise missing from display. Employee handled situation well.',
        ],
        summary:
          'Suspicious individual left without incident after staff engagement. No merchandise loss detected.',
      },
    ],
  },
  // Late afternoon — returns
  {
    offsetHours: -2,
    periods: [
      {
        people: [
          {
            description: 'Woman, 40s, carrying store bag from earlier purchase',
            location: 'Tile 0,1 — register',
            activity: 'Processing a return, showing receipt on phone',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Inspecting returned shoes, checking soles',
          },
          {
            description: 'Teenage girl with mother',
            location: 'Tile 0,0 — athletic section',
            activity: 'Trying on cross-training shoes for school sports',
          },
          {
            description: 'Male employee',
            location: 'Tile 0,0 — assisting teen',
            activity: 'Measuring foot, recommending sizes',
          },
        ],
        interactions: [
          'Return customer explaining issue with shoe fit — employee examining and nodding',
          'Employee using foot measure on teen — parent watching approvingly',
        ],
        movement_patterns: [
          'Return customer went directly to register — knew store layout',
          'Teen and mother browsed 3 areas before settling on athletic section',
        ],
        notable_events: [
          'Return processed for shoes purchased 3 days ago — fit issue',
        ],
        summary:
          'Return processed at register. Teen being fitted for school sports shoes. Normal afternoon pace.',
      },
    ],
  },
  // Evening — closing
  {
    offsetHours: -1,
    periods: [
      {
        people: [
          {
            description: 'Male employee',
            location: 'Tile 0,0 — floor',
            activity:
              'Straightening displays, returning tried-on shoes to racks',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register',
            activity: 'Running end-of-day reports, counting drawer',
          },
          {
            description: 'Last customer, man 60s',
            location: 'Tile 0,0 — walking shoes',
            activity: 'Quick browse, picked up one pair, heading to register',
          },
        ],
        interactions: [
          'Employee gave last customer a quick recommendation as store approached closing',
        ],
        movement_patterns: [
          'Employee doing systematic sweep of floor — left to right',
          'Last customer efficient — in and out in under 5 minutes',
        ],
        notable_events: [
          'Final sale of the day — walking shoes. Store closing procedure beginning.',
        ],
        summary:
          'Last customer of the day made quick purchase. Closing procedures underway — displays reset, drawer counted.',
      },
      {
        people: [
          {
            description: 'Male employee',
            location: 'Tile 0,0 — entrance',
            activity: 'Locking front doors, pulling security gate',
          },
          {
            description: 'Female employee',
            location: 'Tile 0,1 — register/back',
            activity: 'Setting alarm system, grabbing personal belongings',
          },
        ],
        interactions: [
          "Brief conversation between employees — likely discussing tomorrow's schedule",
        ],
        movement_patterns: [
          'Both employees converging on exit after final checks',
        ],
        notable_events: [
          'Store closed for the day. All security measures engaged. No incidents during closing.',
        ],
        summary:
          'Store closed successfully. Security gate locked, alarm set. Both employees exiting together.',
      },
    ],
  },
];

app.post('/', async c => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${c.env.AUTH_TOKEN}`) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const storeId = 'nike_colombo_01';
  const now = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const seeded: string[] = [];

  for (const scenario of SCENARIOS) {
    const sessionStart =
      Math.floor((now + scenario.offsetHours * 3600) / 3600) * 3600;
    const sessionEnd = sessionStart + 3600;
    const interactionId = crypto.randomUUID();

    const periodResults = scenario.periods.map((p, i) => ({
      period_start: sessionStart + i * 300,
      analysis: {
        people: p.people,
        interactions: p.interactions,
        movement_patterns: p.movement_patterns,
        notable_events: p.notable_events,
        summary: p.summary,
      },
    }));

    const periodsAnalyzed = periodResults.length;
    const summaryText = scenario.periods.map(p => p.summary).join(' | ');
    const summaryJson = JSON.stringify({
      text: `Session covered ${periodsAnalyzed} time periods (${periodsAnalyzed} total, 0 failed). ${scenario.periods.flatMap(p => p.people).length} person observations across the session. Notable events: ${scenario.periods.flatMap(p => p.notable_events).join('; ')} Period summaries: ${summaryText}`,
      periods_analyzed: periodsAnalyzed,
      periods_failed: 0,
      total_periods: periodsAnalyzed,
    });

    // Insert interaction
    statements.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO interactions (id, store_id, session_start, session_end, summary, referenced_interactions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        interactionId,
        storeId,
        sessionStart,
        sessionEnd,
        summaryJson,
        null,
        nowIso
      )
    );

    // Insert time period analyses
    for (const pr of periodResults) {
      statements.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO time_period_analyses (id, interaction_id, period_start, analysis, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          interactionId,
          pr.period_start,
          JSON.stringify(pr.analysis),
          nowIso
        )
      );
    }

    seeded.push(
      `${interactionId.substring(0, 8)} (${new Date(sessionStart * 1000).toISOString().substring(11, 16)} UTC, ${periodsAnalyzed} periods)`
    );
  }

  // Seed camera registry
  const cameras = [
    {
      id: 'cam_01',
      zone: 'entrance-floor',
      row: 0,
      col: 0,
      adjacency: { right: 'cam_02' },
    },
    {
      id: 'cam_02',
      zone: 'register-back',
      row: 0,
      col: 1,
      adjacency: { left: 'cam_01' },
    },
  ];
  for (const cam of cameras) {
    statements.push(
      c.env.DB.prepare(
        `INSERT OR REPLACE INTO camera_registry (id, store_id, camera_id, zone, grid_row, grid_col, adjacency, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        `${storeId}_${cam.id}`,
        storeId,
        cam.id,
        cam.zone,
        cam.row,
        cam.col,
        JSON.stringify(cam.adjacency),
        nowIso
      )
    );
  }

  // Seed a calibration
  const today = new Date().toISOString().split('T')[0];
  statements.push(
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO calibrations (id, store_id, date, session_id, reasoning, adjustments, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `${storeId}_${today}`,
      storeId,
      today,
      seeded[2]?.substring(0, 36) ?? null,
      JSON.stringify({
        analysis:
          'Camera alignment verified across 6 sessions. Tile 0,0 covers entrance and floor displays with clear sightlines. Tile 0,1 covers register and back section. Overlap zone near center aisle provides continuity for tracking movement between tiles. Grid positions are optimal for the current 1x2 layout.',
        confidence: 0.92,
        camera_count: 2,
        sessions_analyzed: 6,
      }),
      JSON.stringify([
        {
          camera_id: 'cam_01',
          field: 'zone',
          old_value: null,
          new_value: 'entrance-floor',
          reason: 'Confirmed from observed foot traffic patterns',
        },
        {
          camera_id: 'cam_02',
          field: 'zone',
          old_value: null,
          new_value: 'register-back',
          reason: 'All transactions observed in this tile',
        },
      ]),
      1,
      nowIso
    )
  );

  await c.env.DB.batch(statements);

  return c.json({
    ok: true,
    store_id: storeId,
    interactions_seeded: seeded.length,
    cameras_seeded: cameras.length,
    calibration_seeded: today,
    details: seeded,
  });
});

export default app;
