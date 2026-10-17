// Starter templates written to pack-data on first run (SPEC §3.2).
import type { TripTemplate, TemplateTask, PackingItemTemplate, Phase, Due, TaskKind } from './models'

function task(
  id: string,
  title: string,
  opts: {
    kind?: TaskKind
    phase?: Phase
    due?: Due
    perTraveller?: boolean
    assigneeRole?: 'adult' | 'anyone'
    notes?: string
    checklist?: string[]
    fields?: Record<string, unknown>
  } = {},
): TemplateTask {
  return {
    id,
    kind: opts.kind ?? 'generic',
    title,
    notes: opts.notes ?? '',
    phase: opts.phase ?? 'before',
    due: opts.due ?? { kind: 'relative', anchor: 'departure', offsetHours: -24 },
    perTraveller: opts.perTraveller ?? false,
    assigneeRole: opts.assigneeRole ?? 'anyone',
    checklist: opts.checklist ?? [],
    fields: opts.fields ?? {},
  }
}

const daysBefore = (d: number): Due => ({ kind: 'relative', anchor: 'departure', offsetHours: -24 * d })
const beforeReturn = (h: number): Due => ({ kind: 'relative', anchor: 'return', offsetHours: -h })
const afterReturn = (d: number): Due => ({ kind: 'relative', anchor: 'return', offsetHours: 24 * d })

const items = (names: string[]): PackingItemTemplate[] => names.map((name) => ({ name }))

const COMMON_TASKS: TemplateTask[] = [
  task('pack-bag', 'Pack bag', { kind: 'pack', perTraveller: true, due: daysBefore(1) }),
  task('documents', 'Check passports are valid', {
    kind: 'documents',
    due: daysBefore(70),
    assigneeRole: 'adult',
    fields: { docType: 'Passport' },
    notes: 'Many countries need 6 months left after the trip. A renewal can take 3 weeks or more, so check early.',
  }),
  task('ehic', 'Check GHIC / EHIC cards are valid', {
    kind: 'documents',
    due: daysBefore(42),
    assigneeRole: 'adult',
    fields: { docType: 'GHIC / EHIC' },
    notes: 'Each traveller needs their own card, valid for the whole trip. Renewal is free on the NHS website and the card can take up to 10 days to arrive.',
  }),
  task('insurance', 'Check travel insurance covers this trip', { due: daysBefore(14), assigneeRole: 'adult' }),
  task('chargers', 'Chargers, cables and power bank', { due: daysBefore(1), checklist: ['Phone chargers', 'Power bank', 'Plug adapters'] }),
  task('house', 'House: bins, heating, lights, plants', { due: { kind: 'relative', anchor: 'departure', offsetHours: -2 }, checklist: ['Bins out', 'Heating set', 'Windows locked', 'Plants watered'] }),
  task('unpack', 'Unpack and start washing', { phase: 'after', due: afterReturn(1) }),
]

const COMMON_ADULT: string[] = [
  'Passport',
  'GHIC / EHIC card',
  'Wallet and cards',
  'Phone and charger',
  'Toothbrush and toothpaste',
  'Deodorant',
  'Medication',
  'Underwear',
  'Socks',
  'Sleepwear',
  'Sunglasses',
]

const COMMON_CHILD: string[] = [
  'Passport',
  'GHIC / EHIC card',
  'Toothbrush and toothpaste',
  'Underwear',
  'Socks',
  'Pyjamas',
  'Favourite toy or comforter',
  'Books or tablet',
  'Headphones',
  'Snacks',
  'Water bottle',
]

export const STARTER_TEMPLATES: TripTemplate[] = [
  {
    version: 1,
    id: 'ski',
    name: 'Ski trip',
    tasks: [
      ...COMMON_TASKS,
      task('parking', 'Book airport parking', { kind: 'booking', fields: { bookingKind: 'parking' }, due: daysBefore(21), assigneeRole: 'adult' }),
      task('checkin-out', 'Online check-in (outbound)', { kind: 'checkin', fields: { opens: { kind: 'relative', hoursBefore: 24 } }, due: daysBefore(1), assigneeRole: 'adult' }),
      task('checkin-back', 'Online check-in (return)', { kind: 'checkin', fields: { opens: { kind: 'relative', hoursBefore: 24 } }, phase: 'during', due: beforeReturn(12), assigneeRole: 'adult' }),
      task('weigh', 'Weigh hold bags', { kind: 'weighBag', due: { kind: 'relative', anchor: 'departure', offsetHours: -12 } }),
      task('weigh-back', 'Weigh hold bags for the flight home', { kind: 'weighBag', phase: 'during', due: beforeReturn(12) }),
      task('lift-pass', 'Book lift passes', { due: daysBefore(14), assigneeRole: 'adult' }),
      task('ski-hire', 'Book ski hire', { due: daysBefore(14), assigneeRole: 'adult' }),
      task('ski-school', 'Book ski school / lessons', { due: daysBefore(21), assigneeRole: 'adult' }),
      task('transfer', 'Book airport transfer', { kind: 'booking', fields: { bookingKind: 'other' }, due: daysBefore(21), assigneeRole: 'adult' }),
      task('currency', 'Get currency / check cards work abroad', { due: daysBefore(3), assigneeRole: 'adult' }),
      task('wash-ski', 'Wash and dry ski gear', { phase: 'after', due: afterReturn(2) }),
    ],
    packing: {
      adultDefault: items([...COMMON_ADULT, 'Ski jacket', 'Salopettes', 'Base layers', 'Mid layers', 'Ski socks', 'Ski gloves', 'Goggles', 'Helmet', 'Neck warmer', 'Hat', 'Sun cream', 'Lip balm', 'Swimwear', 'Après boots']),
      child: items([...COMMON_CHILD, 'Ski jacket', 'Salopettes', 'Thermals', 'Ski socks', 'Ski gloves', 'Goggles', 'Helmet', 'Neck warmer', 'Hat', 'Sun cream', 'Swimwear', 'Snow boots']),
      byPerson: {},
    },
  },
  {
    version: 1,
    id: 'camping',
    name: 'Camping',
    tasks: [
      ...COMMON_TASKS,
      task('pitch', 'Book the pitch', { kind: 'booking', fields: { bookingKind: 'accommodation' }, due: daysBefore(21), assigneeRole: 'adult' }),
      task('tent-check', 'Check tent, poles and pegs', { due: daysBefore(7), checklist: ['Tent', 'Poles', 'Pegs', 'Mallet', 'Groundsheet'] }),
      task('camp-kit', 'Pack camp kitchen and gas', { due: daysBefore(1), checklist: ['Stove', 'Gas', 'Pans', 'Plates and cutlery', 'Washing up kit', 'Cool box and ice packs'] }),
      task('food-shop', 'Food shop for the first days', { due: daysBefore(1) }),
      task('car-load', 'Load the car', { due: { kind: 'relative', anchor: 'departure', offsetHours: -2 } }),
      task('dry-tent', 'Dry the tent before storing', { phase: 'after', due: afterReturn(2) }),
    ],
    packing: {
      adultDefault: items([...COMMON_ADULT, 'Sleeping bag', 'Pillow', 'Sleeping mat', 'Head torch', 'Waterproof jacket', 'Walking boots', 'Flip flops', 'Warm jumper', 'Towel', 'Wash bag', 'Camping chair']),
      child: items([...COMMON_CHILD, 'Sleeping bag', 'Pillow', 'Sleeping mat', 'Head torch', 'Waterproof jacket', 'Wellies', 'Warm jumper', 'Towel', 'Swimwear']),
      byPerson: {},
    },
  },
  {
    version: 1,
    id: 'hotel',
    name: 'Hotel holiday',
    tasks: [
      ...COMMON_TASKS,
      task('hotel', 'Book the hotel', { kind: 'booking', fields: { bookingKind: 'accommodation' }, due: daysBefore(30), assigneeRole: 'adult' }),
      task('parking', 'Book airport parking', { kind: 'booking', fields: { bookingKind: 'parking' }, due: daysBefore(21), assigneeRole: 'adult' }),
      task('checkin-out', 'Online check-in (outbound)', { kind: 'checkin', fields: { opens: { kind: 'relative', hoursBefore: 24 } }, due: daysBefore(1), assigneeRole: 'adult' }),
      task('checkin-back', 'Online check-in (return)', { kind: 'checkin', fields: { opens: { kind: 'relative', hoursBefore: 24 } }, phase: 'during', due: beforeReturn(12), assigneeRole: 'adult' }),
      task('weigh', 'Weigh hold bags', { kind: 'weighBag', due: { kind: 'relative', anchor: 'departure', offsetHours: -12 } }),
      task('car-hire', 'Book car hire', { kind: 'booking', fields: { bookingKind: 'carHire' }, due: daysBefore(21), assigneeRole: 'adult' }),
      task('currency', 'Get currency / check cards work abroad', { due: daysBefore(3), assigneeRole: 'adult' }),
    ],
    packing: {
      adultDefault: items([...COMMON_ADULT, 'Swimwear', 'Sun cream', 'Sun hat', 'Sandals', 'Evening outfits', 'Day clothes', 'Light jacket', 'Book or Kindle', 'Beach bag']),
      child: items([...COMMON_CHILD, 'Swimwear', 'Sun cream', 'Sun hat', 'Sandals', 'Day clothes', 'Armbands or goggles', 'Beach toys']),
      byPerson: {},
    },
  },
  {
    version: 1,
    id: 'weekend',
    name: 'Weekend away',
    tasks: [
      task('pack-bag', 'Pack bag', { kind: 'pack', perTraveller: true, due: { kind: 'relative', anchor: 'departure', offsetHours: -12 } }),
      task('stay', 'Book where we are staying', { kind: 'booking', fields: { bookingKind: 'accommodation' }, due: daysBefore(7), assigneeRole: 'adult' }),
      task('house', 'House: bins, heating, lights', { due: { kind: 'relative', anchor: 'departure', offsetHours: -1 }, checklist: ['Bins out', 'Heating set', 'Windows locked'] }),
      task('snacks', 'Car snacks and drinks', { due: { kind: 'relative', anchor: 'departure', offsetHours: -12 } }),
      task('unpack', 'Unpack', { phase: 'after', due: afterReturn(1) }),
    ],
    packing: {
      adultDefault: items(['Wallet and cards', 'Phone and charger', 'Toothbrush and toothpaste', 'Deodorant', 'Medication', 'Underwear', 'Socks', 'Sleepwear', 'Change of clothes', 'Jacket']),
      child: items(['Toothbrush and toothpaste', 'Underwear', 'Socks', 'Pyjamas', 'Change of clothes', 'Jacket', 'Favourite toy or comforter', 'Snacks', 'Water bottle']),
      byPerson: {},
    },
  },
]
