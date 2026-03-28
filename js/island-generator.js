/**
 * island-generator.js  v5
 *
 * Organic island generation using:
 *   • Weighted frontier growth  (region-growing algorithm, NOT noise+threshold)
 *   • Archetype-specific directional bias
 *   • Optional bay carving for deep inlets / bays
 *   • BFS distance-from-coast for biome placement (no percentile tricks)
 *   • FBM moisture noise for smooth, patchy biome zones
 *   • Optional internal lake and optional volcano
 */

import { CONFIG } from './config.js';
import { state, setHexData } from './state.js';
import { createHexData, getNeighbors, OPPOSITE_DIR } from './grid.js';
import { distributeWaterSources } from './water-distribution.js';
import { placeStructures } from './structures.js';
import { placeWildlife } from './wildlife.js';

function rnd()          { return Math.random(); }
function rndInt(a, b)   { return Math.floor(rnd() * (b - a + 1)) + a; }
function rndChoice(arr) { return arr[Math.floor(rnd() * arr.length)]; }

// ═══════════════════════════════════════════════════════════════════════════
// VALUE NOISE  (deterministic, used for moisture + biome-edge softening)
// ═══════════════════════════════════════════════════════════════════════════

function _ihash(n) {
    n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x45d9f3b7);
    n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x45d9f3b7);
    return (n ^ (n >>> 16)) >>> 0;
}
function _vnoise(ix, iy, seed) {
    return _ihash(
        _ihash(_ihash(ix & 0xffff) ^ (_ihash(iy & 0xffff) * 1619 >>> 0)) ^ (seed >>> 0)
    ) / 0x100000000;
}
function _snoise(x, y, seed) {
    const ix = Math.floor(x) | 0, iy = Math.floor(y) | 0;
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return _vnoise(ix,   iy,   seed) * (1-ux) * (1-uy)
         + _vnoise(ix+1, iy,   seed) *    ux  * (1-uy)
         + _vnoise(ix,   iy+1, seed) * (1-ux) *    uy
         + _vnoise(ix+1, iy+1, seed) *    ux  *    uy;
}
function _fbm(x, y, oct, seed) {
    let v = 0, a = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) {
        v   += _snoise(x*f, y*f, ((seed + i*53) >>> 0)) * a;
        tot += a;
        a   *= 0.5;
        f   *= 2.03;
    }
    return v / tot;
}

// ═══════════════════════════════════════════════════════════════════════════
// ISLAND ARCHETYPES
// ═══════════════════════════════════════════════════════════════════════════

const ISLAND_TYPES = [
    'compact',    // organic rounded blob
    'elongated',  // stretched 2:1 – 3:1 along a random axis
    'crescent',   // C-shape — growth suppressed inside a bay sector
    'peninsula',  // circular body + one thin reaching arm
    'irregular',  // multi-pole growth, lumpy and asymmetric
];

// Land coverage fraction of total grid hexes
const LAND_FRACTIONS = { small: 0.30, medium: 0.28, large: 0.26 };

// ── Per-archetype random parameters ──────────────────────────────────────

function _archetypeParams(type) {
    switch (type) {
        case 'compact':
            return {};

        case 'elongated':
            return {
                axis:   rnd() * Math.PI,
                aspect: 2.1 + rnd() * 1.2,   // 2.1 – 3.3
            };

        case 'crescent':
            return {
                cutAngle: rnd() * Math.PI * 2,
                arcGap:   Math.PI * (0.45 + rnd() * 0.40),  // 80 – 115 °
            };

        case 'peninsula':
            return {
                bodyFrac:  0.50 + rnd() * 0.15,   // fraction of maxR for body radius
                armAngle:  rnd() * Math.PI * 2,
                armLen:    0.55 + rnd() * 0.40,   // fraction of maxR
                armWidth:  0.14 + rnd() * 0.09,
            };

        case 'irregular': {
            const n = rndInt(3, 5);
            return {
                poles: Array.from({ length: n }, () => ({
                    ndx: (rnd() - 0.5) * 1.4,  // normalised offset
                    ndy: (rnd() - 0.5) * 1.4,
                    r2:  (0.35 + rnd() * 0.40) ** 2,
                })),
            };
        }

        default:
            return {};
    }
}

/**
 * Directional growth bias for a candidate frontier hex.
 * Returns a weight multiplier in [0.01, 2.0].
 *
 * @param {string} type     archetype name
 * @param {number} dx       hex offset from centre (hex units)
 * @param {number} dy
 * @param {object} params   from _archetypeParams
 * @param {number} maxR     soft growth radius (hex units)
 */
function _archetypeWeight(type, dx, dy, params, maxR) {
    const ndx = dx / maxR, ndy = dy / maxR;

    switch (type) {

        case 'compact':
            return 1.0;

        case 'elongated': {
            const cos = Math.cos(params.axis), sin = Math.sin(params.axis);
            const u   =  ndx * cos + ndy * sin;  // along main axis
            const v   = -ndx * sin + ndy * cos;  // perpendicular
            // Suppress growth perpendicular to axis
            const suppPerp = Math.exp(-v * v * params.aspect * 2.5);
            // Soft cap along axis
            const capAlong = Math.abs(u) > params.aspect * 0.7 ? 0.1 : 1.0;
            return Math.max(0.02, suppPerp * capAlong);
        }

        case 'crescent': {
            const angle = Math.atan2(ndy, ndx);
            let da = angle - params.cutAngle;
            while (da >  Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            // Near-zero weight inside the bay sector
            if (Math.abs(da) < params.arcGap * 0.5) return 0.01;
            return 1.0;
        }

        case 'peninsula': {
            const nd = Math.sqrt(ndx * ndx + ndy * ndy);
            if (nd < params.bodyFrac) return 1.2;   // inside body: preferred
            const cos  = Math.cos(params.armAngle), sin = Math.sin(params.armAngle);
            const proj =  ndx * cos + ndy * sin;
            const perp = Math.abs(-ndx * sin + ndy * cos);
            if (proj > 0.02 && proj < params.armLen && perp < params.armWidth) return 1.5;
            return 0.03;  // outside body and arm: very low
        }

        case 'irregular': {
            let maxW = 0.05;
            for (const pole of params.poles) {
                const pd2 = (ndx - pole.ndx) ** 2 + (ndy - pole.ndy) ** 2;
                maxW = Math.max(maxW, Math.exp(-pd2 / pole.r2));
            }
            return 0.15 + 1.2 * maxW;
        }

        default:
            return 1.0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ISLAND GROWTH  — weighted frontier expansion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Grows an island outward from (cx, cy) using weighted frontier selection.
 * Each candidate hex is weighted by its archetype-specific directional bias
 * and a soft distance penalty.  Margin hexes are hard-excluded.
 *
 * @returns {Set<string>}  set of 'q,r' keys forming the grown land mass
 */
function _growIsland(cx, cy, targetSize, type, params, maxR, marginHexes) {
    const land    = new Set();
    const seen    = new Set();
    const frontier = [];    // { q, r, w }

    const _addFrontier = (q, r) => {
        const k = `${q},${r}`;
        if (seen.has(k) || !state.hexData.has(k) || marginHexes.has(k)) return;
        seen.add(k);
        const dx = q - cx, dy = r - cy;
        const nd  = Math.sqrt(dx*dx + dy*dy) / maxR;
        // Soft radial edge penalty
        const edgePen = Math.max(0.005, 1.0 - nd * 0.75);
        const w = _archetypeWeight(type, dx, dy, params, maxR) * edgePen;
        frontier.push({ q, r, w: Math.max(0.001, w) });
    };

    // Seed from centre
    const ck = `${cx},${cy}`;
    if (!state.hexData.has(ck) || marginHexes.has(ck)) return land;
    land.add(ck);
    seen.add(ck);
    for (const nb of getNeighbors(cx, cy)) _addFrontier(nb.q, nb.r);

    while (land.size < targetSize && frontier.length > 0) {
        // Weighted random selection
        let totalW = 0;
        for (const h of frontier) totalW += h.w;

        let pick = rnd() * totalW;
        let idx  = frontier.length - 1;
        for (let i = 0; i < frontier.length; i++) {
            pick -= frontier[i].w;
            if (pick <= 0) { idx = i; break; }
        }

        const { q, r } = frontier[idx];
        // O(1) removal — swap with last
        frontier[idx] = frontier[frontier.length - 1];
        frontier.pop();

        land.add(`${q},${r}`);
        for (const nb of getNeighbors(q, r)) _addFrontier(nb.q, nb.r);
    }

    return land;
}

// ═══════════════════════════════════════════════════════════════════════════
// BAY CARVING  — optional erosion pass to cut bays and inlets
// ═══════════════════════════════════════════════════════════════════════════

function _carveBays(land, numBays) {
    for (let b = 0; b < numBays; b++) {
        // Collect coastal hexes
        const coastal = [];
        for (const key of land) {
            const [q, r] = key.split(',').map(Number);
            if (getNeighbors(q, r).some(nb => !land.has(`${nb.q},${nb.r}`))) {
                coastal.push(key);
            }
        }
        if (coastal.length < 6) break;

        const startKey = coastal[Math.floor(rnd() * coastal.length)];
        if (!land.has(startKey)) continue;

        const removed = [];
        land.delete(startKey);
        removed.push(startKey);

        const depth = rndInt(1, 3);
        let wave = [startKey];

        for (let d = 0; d < depth && wave.length > 0; d++) {
            const nextWave = [];
            for (const key of wave) {
                const [q, r] = key.split(',').map(Number);
                for (const nb of getNeighbors(q, r)) {
                    const nk = `${nb.q},${nb.r}`;
                    if (!land.has(nk)) continue;
                    // Only erode if hex isn't a bridge (has ≥ 3 land neighbours)
                    const nbCount = getNeighbors(nb.q, nb.r)
                        .filter(n => land.has(`${n.q},${n.r}`)).length;
                    if (nbCount >= 3 && rnd() < 0.45) {
                        land.delete(nk);
                        removed.push(nk);
                        nextWave.push(nk);
                    }
                }
            }
            wave = nextWave;
        }

        // If carving shrank island too much, restore
        if (land.size < 10) {
            for (const k of removed) land.add(k);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTED COMPONENT  — BFS, returns largest land cluster
// ═══════════════════════════════════════════════════════════════════════════

function _largestComponent(landSet) {
    const visited = new Set();
    let   largest = new Set();

    for (const key of landSet) {
        if (visited.has(key)) continue;
        const comp  = new Set([key]);
        const queue = [key];
        visited.add(key);

        while (queue.length) {
            const cur = queue.shift();
            const [q, r] = cur.split(',').map(Number);
            for (const nb of getNeighbors(q, r)) {
                const nk = `${nb.q},${nb.r}`;
                if (visited.has(nk) || !landSet.has(nk)) continue;
                visited.add(nk); comp.add(nk); queue.push(nk);
            }
        }
        if (comp.size > largest.size) largest = comp;
    }
    return largest;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISTANCE FROM COAST  — BFS inward, dist 1 = coastal hex
// ═══════════════════════════════════════════════════════════════════════════

function _computeDistFromCoast(mainLand) {
    const dist  = new Map();
    const queue = [];

    for (const key of mainLand) {
        const [q, r] = key.split(',').map(Number);
        if (getNeighbors(q, r).some(nb => !mainLand.has(`${nb.q},${nb.r}`))) {
            dist.set(key, 1);
            queue.push(key);
        }
    }

    let qi = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        const d   = dist.get(cur);
        const [q, r] = cur.split(',').map(Number);
        for (const nb of getNeighbors(q, r)) {
            const nk = `${nb.q},${nb.r}`;
            if (mainLand.has(nk) && !dist.has(nk)) {
                dist.set(nk, d + 1);
                queue.push(nk);
            }
        }
    }
    return dist;
}

// ═══════════════════════════════════════════════════════════════════════════
// BIOME ASSIGNMENT  — distance from coast + moisture noise
// ═══════════════════════════════════════════════════════════════════════════

function _assignBiomes(mainLand, distMap, noiseSeed) {
    const maxDist = Math.max(1, ...distMap.values());

    // Pre-compute moisture for every land hex
    for (const key of mainLand) {
        const [q, r] = key.split(',').map(Number);
        const d = state.hexData.get(key);
        if (d) d.moisture = _fbm(q * 0.18, r * 0.18, 4, noiseSeed);
    }

    for (const [key, dist] of distMap) {
        const [q, r] = key.split(',').map(Number);
        const d = state.hexData.get(key);
        if (!d) continue;
        const m = d.moisture;

        // Noise offsets the effective distance slightly → organic biome edges
        const edgeNoise = _fbm(q * 0.30, r * 0.30, 3, (noiseSeed + 337) >>> 0);
        const eff  = dist + (edgeNoise - 0.5) * maxDist * 0.28;
        const rel  = eff / maxDist;   // 0 = coast, 1 = deepest interior

        if (dist <= 1) {
            // ── Coastline ────────────────────────────────────────────────
            d.terrain = (m > 0.73) ? 'swamp' : 'beach';

        } else if (dist === 2) {
            // ── Just inside coast: mostly beach, some interior begins ────
            d.terrain = rnd() < 0.50
                ? 'beach'
                : (m > 0.55 ? 'jungle' : 'plains');

        } else if (rel < 0.32) {
            // ── Inner coastal belt ────────────────────────────────────────
            if      (m > 0.72) d.terrain = 'jungle';
            else if (m > 0.48) d.terrain = m > 0.60 ? 'jungle' : 'plains';
            else               d.terrain = 'plains';

        } else if (rel < 0.54) {
            // ── Mid interior: main jungle / plains band ───────────────────
            d.terrain = m > 0.53 ? 'jungle' : 'plains';

        } else if (rel < 0.68) {
            // ── Transition to uplands ─────────────────────────────────────
            if      (m > 0.70) d.terrain = 'jungle';
            else if (rnd() < 0.42) d.terrain = 'hills';
            else    d.terrain = 'plains';

        } else if (rel < 0.80) {
            // ── Hills zone ────────────────────────────────────────────────
            d.terrain = rnd() < 0.72 ? 'hills' : (m > 0.60 ? 'jungle' : 'plains');

        } else if (rel < 0.90) {
            // ── Rugged: hills + rocks ────────────────────────────────────
            d.terrain = rnd() < 0.50 ? 'rocks' : 'hills';

        } else {
            // ── Summit core: mountains ────────────────────────────────────
            d.terrain = rnd() < 0.62 ? 'mountains' : 'rocks';
        }
    }

    // Small islands: cap terrain so they don't get mountains at dist=3
    if (maxDist < 8) {
        for (const key of mainLand) {
            const d = state.hexData.get(key);
            if (d && d.terrain === 'mountains') d.terrain = 'hills';
        }
    }
    if (maxDist < 5) {
        for (const key of mainLand) {
            const d = state.hexData.get(key);
            if (d && (d.terrain === 'hills' || d.terrain === 'rocks')) d.terrain = 'plains';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// COASTAL BEACH SAFETY PASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts any land hex adjacent to water into beach unless it is
 * mountains / rocks / swamp / volcano — those naturally touch the sea.
 */
function _fixCoastalBeaches(mainLand) {
    const immune = new Set(['mountains', 'rocks', 'swamp', 'volcano', 'water']);
    for (const key of mainLand) {
        const [q, r] = key.split(',').map(Number);
        const d = state.hexData.get(key);
        if (!d || immune.has(d.terrain)) continue;
        const coastal = getNeighbors(q, r).some(nb => !mainLand.has(`${nb.q},${nb.r}`));
        if (coastal) d.terrain = 'beach';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONAL INTERNAL LAKE
// ═══════════════════════════════════════════════════════════════════════════

function _addInternalLake(mainLand, distMap) {
    const maxDist = Math.max(1, ...distMap.values());
    const threshold = maxDist * 0.60;

    // Candidate hexes: deep interior (far from coast)
    const deep = [...distMap.entries()]
        .filter(([, d]) => d >= threshold)
        .map(([k]) => k);

    if (deep.length < 4) return;

    // Pick a random deep hex as lake seed
    const lakeKey  = deep[Math.floor(rnd() * deep.length)];
    const lakeSize = rndInt(3, Math.min(8, Math.floor(deep.length * 0.40)));

    const toRemove = new Set([lakeKey]);
    const queue    = [lakeKey];

    while (queue.length > 0 && toRemove.size < lakeSize) {
        const cur = queue.shift();
        const [q, r] = cur.split(',').map(Number);
        for (const nb of getNeighbors(q, r)) {
            const nk = `${nb.q},${nb.r}`;
            if (!mainLand.has(nk) || toRemove.has(nk)) continue;
            if (toRemove.size >= lakeSize) break;
            if (rnd() < 0.65) { toRemove.add(nk); queue.push(nk); }
        }
    }

    // Safety: don't carve so much that connectivity is lost
    const testLand = new Set([...mainLand].filter(k => !toRemove.has(k)));
    const comp     = _largestComponent(testLand);
    if (comp.size < testLand.size * 0.96) return;   // would fragment — abort

    for (const k of toRemove) {
        const d = state.hexData.get(k);
        if (d) {
            d.terrain      = 'water';
            d.isMainIsland = false;
        }
        mainLand.delete(k);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOLCANO  — optional, placed in the mountain zone
// ═══════════════════════════════════════════════════════════════════════════

function _placeVolcano(mainLand) {
    const mountains = [];
    for (const key of mainLand) {
        const d = state.hexData.get(key);
        if (d && d.terrain === 'mountains') mountains.push({ key, e: d.elevation });
    }
    if (mountains.length === 0) return;

    mountains.sort((a, b) => b.e - a.e);
    const cap  = Math.max(1, Math.ceil(mountains.length * 0.33));
    const pick = mountains[Math.floor(rnd() * cap)];
    const d    = state.hexData.get(pick.key);
    if (!d) return;
    d.terrain = 'volcano';

    // Optionally spread 1 extra hex
    const [pq, pr] = pick.key.split(',').map(Number);
    for (const nb of getNeighbors(pq, pr)) {
        if (rnd() >= 0.40) continue;
        const nd = state.hexData.get(`${nb.q},${nb.r}`);
        if (nd && nd.terrain === 'mountains') { nd.terrain = 'volcano'; break; }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SATELLITE ISLETS
// ═══════════════════════════════════════════════════════════════════════════

function _generateSatelliteIslets(cx, cy, mainLand, minQ, maxQ, minR, maxR, margin) {
    const num = rndInt(0, 3);

    for (let i = 0; i < num; i++) {
        const ang   = rnd() * Math.PI * 2;
        const baseR = Math.sqrt(mainLand.size / Math.PI) * 1.8;
        const dist  = baseR * (1.10 + rnd() * 0.60);
        const iq    = Math.round(cx + Math.cos(ang) * dist);
        const ir    = Math.round(cy + Math.sin(ang) * dist);

        if (iq < minQ + margin + 1 || iq > maxQ - margin - 1) continue;
        if (ir < minR + margin + 1 || ir > maxR - margin - 1) continue;
        if (!state.hexData.has(`${iq},${ir}`)) continue;
        if (mainLand.has(`${iq},${ir}`)) continue;

        const size   = rndInt(2, 5);
        const islet  = new Set([`${iq},${ir}`]);
        const queue  = [{ q: iq, r: ir }];

        while (queue.length && islet.size < size) {
            const cur = queue.shift();
            for (const nb of getNeighbors(cur.q, cur.r)) {
                if (islet.size >= size) break;
                const nk = `${nb.q},${nb.r}`;
                if (islet.has(nk) || mainLand.has(nk)) continue;
                if (nb.q < minQ+margin+1 || nb.q > maxQ-margin-1) continue;
                if (nb.r < minR+margin+1 || nb.r > maxR-margin-1) continue;
                if (rnd() < 0.55) { islet.add(nk); queue.push({ q: nb.q, r: nb.r }); }
            }
        }

        for (const key of islet) {
            const d = state.hexData.get(key);
            if (!d || mainLand.has(key)) continue;
            d.terrain         = rnd() < 0.60 ? 'beach' : (rnd() < 0.50 ? 'jungle' : 'plains');
            d.elevation       = 0.35 + rnd() * 0.15;
            d.moisture        = rnd();
            d.isIslet         = true;
            d.isMainIsland    = false;
            d.isSpawnEligible = false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTIONS
// ═══════════════════════════════════════════════════════════════════════════

function _generateConnections() {
    // Forward pass
    state.hexData.forEach(data => {
        for (const nb of getNeighbors(data.q, data.r)) {
            const nd = state.hexData.get(`${nb.q},${nb.r}`);
            if (!nd) { data.connections[nb.dirIndex] = false; continue; }
            if (data.terrain === 'water' || nd.terrain === 'water') {
                data.connections[nb.dirIndex] = false; continue;
            }
            if (['mountains','volcano'].includes(data.terrain) ||
                ['mountains','volcano'].includes(nd.terrain)) {
                data.connections[nb.dirIndex] = false; continue;
            }
            if (data.terrain === 'jungle' && nd.terrain === 'jungle') {
                data.connections[nb.dirIndex] = rnd() < 0.60; continue;
            }
            if (data.terrain === 'rocks' || nd.terrain === 'rocks') {
                data.connections[nb.dirIndex] = rnd() < 0.70; continue;
            }
            data.connections[nb.dirIndex] = true;
        }
    });

    // Symmetry pass
    state.hexData.forEach(data => {
        for (const nb of getNeighbors(data.q, data.r)) {
            const nd  = state.hexData.get(`${nb.q},${nb.r}`);
            if (!nd) continue;
            const opp = OPPOSITE_DIR[nb.dirIndex];
            if (!data.connections[nb.dirIndex] &&  nd.connections[opp]) nd.connections[opp] = false;
            if ( data.connections[nb.dirIndex] && !nd.connections[opp]) nd.connections[opp] = true;
        }
    });

    // Playability: every beach must connect to at least one traversable neighbour
    state.hexData.forEach(data => {
        if (data.terrain !== 'beach') return;
        const hasConn = getNeighbors(data.q, data.r).some(nb => {
            const nd = state.hexData.get(`${nb.q},${nb.r}`);
            return nd && nd.terrain !== 'water' && data.connections[nb.dirIndex];
        });
        if (hasConn) return;
        const cands = getNeighbors(data.q, data.r).filter(nb => {
            const nd = state.hexData.get(`${nb.q},${nb.r}`);
            return nd && !['water','mountains','volcano'].includes(nd.terrain);
        });
        if (cands.length === 0) return;
        const pick = cands[Math.floor(rnd() * cands.length)];
        data.connections[pick.dirIndex] = true;
        const nd = state.hexData.get(`${pick.q},${pick.r}`);
        if (nd) nd.connections[OPPOSITE_DIR[pick.dirIndex]] = true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export async function generateIsland(mapSize, setProgress) {
    state.hexData.clear();
    state.hexGraphicsCache.clear();
    setProgress(0.05);

    // ── Step 1: fill grid with water, compute bounds ───────────────────────
    let minQ = Infinity, maxQ = -Infinity;
    let minR = Infinity, maxR = -Infinity;
    let sumQ = 0, sumR = 0, cnt = 0;

    state.hexGrid.forEach(hex => {
        const d = createHexData(hex.q, hex.r, 'water');
        setHexData(hex.q, hex.r, d);
        const { q, r } = hex;
        if (q < minQ) minQ = q; if (q > maxQ) maxQ = q;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        sumQ += q; sumR += r; cnt++;
    });

    const cx = Math.round(sumQ / cnt);
    const cy = Math.round(sumR / cnt);
    state.islandCenterQ = cx;
    state.islandCenterR = cy;

    const margin = CONFIG.ISLAND_MARGIN;

    // ── Step 2: build margin hex set (hard boundary — never land) ─────────
    const marginHexes = new Set();
    state.hexData.forEach((_, key) => {
        const [q, r] = key.split(',').map(Number);
        if (q < minQ + margin || q > maxQ - margin ||
            r < minR + margin || r > maxR - margin) {
            marginHexes.add(key);
        }
    });

    setProgress(0.10);

    // ── Step 3: choose archetype, compute growth parameters ────────────────
    const islandType = rndChoice(ISLAND_TYPES);
    const params     = _archetypeParams(islandType);
    const landFrac   = LAND_FRACTIONS[mapSize] ?? 0.28;
    const targetSize = Math.max(20, Math.floor(cnt * landFrac));
    // maxR: soft radius that just contains a perfect circle of targetSize hexes
    const maxR_grow  = Math.sqrt(targetSize / Math.PI) * 1.55;
    // Noise seed (seeded-random ensures determinism in multiplayer)
    const noiseSeed  = (rnd() * 0x7fffffff) >>> 0;

    console.log(`[island-gen] archetype=${islandType}  target=${targetSize}  maxR=${maxR_grow.toFixed(1)}`);
    setProgress(0.14);

    // ── Step 4: grow the island ─────────────────────────────────────────────
    const rawLand = _growIsland(cx, cy, targetSize, islandType, params, maxR_grow, marginHexes);
    setProgress(0.26);

    // ── Step 5: optional bay carving (more for compact and irregular) ───────
    const numBays = islandType === 'crescent' ? 0
                  : islandType === 'peninsula' ? rndInt(0, 2)
                  : rndInt(1, 4);
    if (numBays > 0) _carveBays(rawLand, numBays);
    setProgress(0.33);

    // ── Step 6: keep only the largest connected component ──────────────────
    const mainKeys = _largestComponent(rawLand);

    state.hexData.forEach((d, key) => {
        if (mainKeys.has(key))       d.isMainIsland = true;
        else if (rawLand.has(key))   d.isIslet      = true;
    });
    setProgress(0.40);

    // ── Step 7: BFS distance from coast ────────────────────────────────────
    const distMap = _computeDistFromCoast(mainKeys);
    setProgress(0.46);

    // ── Step 8: assign biomes ───────────────────────────────────────────────
    _assignBiomes(mainKeys, distMap, noiseSeed);
    setProgress(0.52);

    // ── Step 9: optional internal lake (40 %) ──────────────────────────────
    if (rnd() < 0.40) _addInternalLake(mainKeys, distMap);
    setProgress(0.56);

    // ── Step 10: coastal beach safety pass ────────────────────────────────
    _fixCoastalBeaches(mainKeys);
    setProgress(0.60);

    // ── Step 11: optional volcano (30 %) ───────────────────────────────────
    if (rnd() < (CONFIG.VOLCANO_CHANCE ?? 0.30)) _placeVolcano(mainKeys);
    setProgress(0.63);

    // ── Step 12: spawn-eligible hexes (main-island beaches only) ──────────
    state.hexData.forEach(d => {
        d.isSpawnEligible = !!(d.isMainIsland && d.terrain === 'beach');
    });
    setProgress(0.66);

    // ── Step 13: satellite islets ──────────────────────────────────────────
    _generateSatelliteIslets(cx, cy, mainKeys, minQ, maxQ, minR, maxR, margin);
    setProgress(0.71);

    // ── Step 14: connections ───────────────────────────────────────────────
    _generateConnections();
    setProgress(0.77);

    // ── Step 15: water sources ─────────────────────────────────────────────
    distributeWaterSources();
    setProgress(0.83);

    // ── Step 16: structures ────────────────────────────────────────────────
    placeStructures();
    setProgress(0.89);

    // ── Step 17: wildlife ──────────────────────────────────────────────────
    placeWildlife();
    setProgress(0.95);
}

// ─────────────────────────────────────────────────────────────────────────

export function getIslandCenter() {
    return { q: state.islandCenterQ, r: state.islandCenterR };
}
