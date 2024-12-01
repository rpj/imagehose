import fs from 'fs';
import profanities from '@dsojevic/profanity-list';

export default function (): RegExp[] {
  let additionalFilters = [];
  try {
    additionalFilters = JSON.parse(process.env.IMAGEHOSE_ADDL_FILTERS_JSON);
    console.log(`Sourced ${additionalFilters.length} additional filters from env`);
  } catch {
    try {
      additionalFilters = JSON.parse(fs.readFileSync(process.env.IMAGEHOSE_ADDL_FILTERS_JSON).toString('utf-8'));
      console.log(`Sourced ${additionalFilters.length} additional filters from ${process.env.IMAGEHOSE_ADDL_FILTERS_JSON}`);
    } catch { }
  }

  return [...new Set([
    ...Object.values(profanities).flat()
      .map(({ match }) => match)
      .map((m) => m.split('|'))
      .flat()
      .map((f) => f.replace('*', '\\*')),
    ...additionalFilters
  ].map((f) => new RegExp(`(?:\\W|^)${f}(?:\\W|$)`, 'ig')))];
}
