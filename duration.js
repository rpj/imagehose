'use strict';

const dfns = require('date-fns');

module.exports = {
  fmtDuration (start, allowSeconds = false, end = new Date()) {
    if (typeof start === 'string') {
      start = dfns.parseISO(start);
    }

    const defOpts = ['years', 'months', 'weeks', 'days', 'hours', 'minutes'];

    if (allowSeconds) {
      defOpts.push('seconds');
    }

    const options = { format: defOpts };
    const fmt = () => dfns.formatDuration(dfns.intervalToDuration({ start, end }), options);
    let dur = fmt();

    if (!dur) {
      options.format.push('seconds');
      dur = fmt();
    }

    if (dur.match(/days/)) {
      options.format.pop();
      dur = fmt();
    }

    return dur;
  },
};
