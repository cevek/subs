import {readFileSync, writeFileSync} from 'fs';
const argv = require('minimist')(process.argv.slice(2));
if (!argv.en && !argv.ru) {
    console.log('Usage: mergesub --en en.srt --ru ru.srt');
    process.exit();
}

if (!argv.en) {
    console.error('no en srt file specified');
    process.exit();
}
if (!argv.ru) {
    console.error('no ru srt file specified');
    process.exit();
}
let ensrt = '';
let rusrt = '';
try {
    ensrt = readFileSync(argv.en, 'utf-8');
    rusrt = readFileSync(argv.ru, 'utf-8');
} catch (e) {
    console.error(e);
    process.exit();
}
type Maybe<T> = T | null | undefined;
interface Srt {
    start: number;
    end: number;
    text: string;
}
interface MergedSub {
    start: number;
    end: number;
    enText: string;
    ruSubs: Srt[];
}
function parseSrc(srt: string) {
    const re = /\d+\s+(\d+):(\d+):(\d+)[.,](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)\s+([\s\S]*?)(?=\r?\n\r?\n\d+|\s*$)/g;
    let result: Srt[] = [];
    let res;
    while (res = re.exec(srt)) {
        result.push({
            start: +res[1] * 3600 + +res[2] * 60 + +res[3] + +res[4] / 1000,
            end: +res[5] * 3600 + +res[6] * 60 + +res[7] + +res[8] / 1000,
            text: res[9],
        });
    }
    return result;
}

function splitRuNewLines(ruSub: Srt[]) {
    for (let i = 0; i < ruSub.length; i++) {
        const sub = ruSub[i];
        const items = sub.text.split('\n');
        if (items.length > 1) {
            const dur = (sub.end - sub.start) / items.length;
            const start = sub.start;
            ruSub.splice(i, 1);
            for (let j = 0; j < items.length; j++) {
                const item = items[j];
                ruSub.splice(i + j, 0, {start: start + dur * j, end: start + dur * (j + 1), text: item});
            }
            i += items.length - 1;
        }
    }
}


function merge(en: Srt[], ru: Srt[], ruShift: number) {
    let j = 0;
    const resultSub: MergedSub[] = en.map(sub => ({
        start: sub.start,
        end: sub.end,
        enText: sub.text,
        ruSubs: []
    }));
    for (let k = 0; k < 2; k += .5) {
        let lastJ = 1;
        for (let i = 0; i < en.length; i++) {
            const enSub = en[i];
            // console.log('-------------------', k);
            // console.log(i, enSub);
            j = lastJ;
            let ruSub = ru[j];
            while (ruSub && (ruSub.start + ruShift) < enSub.end + k) {
                // console.log(j, overlapPercent(enSub, ruSub, ruShift, k), ruSub);
                if (overlapPercent(enSub, ruSub, ruShift, k) > 30) {
                    resultSub[i].ruSubs.push(ruSub);
                    // console.log('merge', ruSub);
                    ru.splice(j, 1);
                    j--;
                    lastJ = j;
                }
                if (enSub.start - ruSub.start > 10) {
                    lastJ = j;
                }
                j++;
                ruSub = ru[j];
            }
            // mergedSub.ruText = mergedSub.ruText.trim();
        }
    }
    // console.log(ru);
    // console.log(ru);
    console.log(`Skipped count: ${ru.length}`);
    return resultSub;
}
function countNonOverlapped(en: Srt[], ru: Srt[], ruShift: number) {
    let j = 0;
    let lastFoundRu = 1;
    let nonOverlapped = 0;
    for (let i = 0; i < en.length; i++) {
        const enSub = en[i];
        j = lastFoundRu - 1;
        let ruSub = ru[j];
        while (ruSub && (ruSub.start + ruShift) < enSub.end) {
            if (overlapPercent(enSub, ruSub, ruShift, 0) > 30) {
                if (j - lastFoundRu > 1) {
                    nonOverlapped += j - lastFoundRu - 1;
                }
                lastFoundRu = j;
            }
            j++;
            ruSub = ru[j];
        }
    }
    return nonOverlapped;
}

// function spreadNonMergedRuSubs(enSubs: MergedSub[], ruSubs: Srt[], enPos: number, ruStart: number, ruEnd: number, ruShift: number) {
//     const left: Maybe<MergedSub> = enSubs[enPos - 1];
//     const right = enSubs[enPos];
//     const maxDistance = 3;
//     let nonMergedCount = 0;
//     for (let i = ruStart; i <= ruEnd; i++) {
//         const ruSub = ruSubs[i];
//         if (!left) {
//             if ((ruSub.end + ruShift) > right.start - maxDistance) {
//                 right.ruText = ruSub.text + '\n' + right.ruText;
//             } else {
//                 // console.log('non merged, right', ruSub, right);
//                 nonMergedCount++;
//             }
//             continue;
//         }
//         if ((ruSub.start + ruShift) < (left.end + maxDistance) || (ruSub.end + ruShift) > (right.start - maxDistance)) {
//             console.log('xxx', ruSub, left, right);
//             const middle = ((ruSub.end - ruSub.start) / 2) + ruShift;
//             if (middle - left.end < right.start - middle) {
//                 console.log('merge1', middle - left.end);
//                 left.ruText += '\n' + ruSub.text;
//             } else {
//                 console.log('merge2', right.start - middle);
//                 right.ruText = ruSub.text + '\n' + right.ruText;
//             }
//         } else {
//             // console.log('non merged', ruSub, left, right);
//             nonMergedCount++;
//         }
//     }
//     return nonMergedCount;
// }

function sortSub(a: Srt, b: Srt) {
    return a.start < b.end ? -1 : 1;
}
function buildMergedSrt(merged: MergedSub[]) {
    let srt = '';
    for (let i = 0; i < merged.length; i++) {
        const sub = merged[i];
        sub.ruSubs.sort(sortSub);
        let ruText = '';
        for (let j = 0; j < sub.ruSubs.length; j++) {
            const ruSub = sub.ruSubs[j];
            ruText += ruSub.text + '\n';
        }
        srt += `${i + 1}\n${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n${sub.enText}\n<font size="20" color="gray">${ruText.trim()}</font>\n\n`;
    }
    return srt;
}

const ru = parseSrc(rusrt);
splitRuNewLines(ru);
// console.log(ru);
const en = parseSrc(ensrt);
function findShift(en: Srt[], ru: Srt[]) {
    let max = Infinity;
    let shift = 0;
    for (let i = -30; i <= 30; i++) {
        const nonOverlapped = countNonOverlapped(en, ru, i / 10);
        // console.log(`${i} - ${nonOverlapped}`);
        if (max > nonOverlapped) {
            max = nonOverlapped;
            shift = i / 10;
        }
    }
}
let shift = 0; //findShift(en, ru);
console.log(`Shift: ${shift}`);
const merged = merge(en, ru, shift);
// console.dir(merged, {depth: Infinity});
const srt = buildMergedSrt(merged);
writeFileSync(process.cwd() + '/merged.srt', srt);
console.log(process.cwd() + '/merged.srt');


function formatSrtTime(time: number) {
    return `${('0' + Math.floor(time / 3600)).substr(-2)}:${('0' + Math.floor(time / 60) % 60).substr(-2)}:${('0' + (time % 60).toFixed(3)).substr(-6)}`;
}

function overlapPercent(en: Srt, ru: Srt, ruShift: number, spreadSec: number) {
    const start = Math.max(en.start - spreadSec, ru.start + ruShift);
    const end = Math.min(en.end + spreadSec, ru.end + ruShift);
    if (start >= end) return 0;
    return (end - start) / (ru.end - ru.start + spreadSec * 2) * 100 | 0;
}