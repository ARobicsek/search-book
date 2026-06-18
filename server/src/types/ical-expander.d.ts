// Minimal ambient types for `ical-expander` (ships no types). We only use the
// pieces below; ICAL.* objects are treated loosely as `any`.
declare module 'ical-expander' {
  interface IcalExpanderOptions {
    ics: string;
    maxIterations?: number;
    skipInvalidDates?: boolean;
  }
  interface OccurrenceDetails {
    recurrenceId: any;
    item: any; // ICAL.Event
    startDate: any; // ICAL.Time
    endDate: any; // ICAL.Time
  }
  interface ExpandResult {
    events: any[]; // ICAL.Event[] (non-recurring in range)
    occurrences: OccurrenceDetails[]; // recurring occurrences in range
  }
  class IcalExpander {
    constructor(opts: IcalExpanderOptions);
    between(after?: Date, before?: Date): ExpandResult;
    before(before: Date): ExpandResult;
    after(after: Date): ExpandResult;
    all(): ExpandResult;
  }
  export = IcalExpander;
}
