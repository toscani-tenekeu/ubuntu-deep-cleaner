import { Quarantine } from './quarantine.js';

const stateRoot = process.env.UDC_STATE_DIR ?? '/var/lib/ubuntu-deep-cleaner';
const result = await new Quarantine(stateRoot).purgeExpired();
process.stdout.write(`Purged ${result.purged} expired quarantine entries (${result.bytes} bytes).\n`);
