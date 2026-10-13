import {
  addDays,
  dayMonth,
  daysBetween,
  localIsoDate,
  shortDate,
} from './dates';

describe('localIsoDate', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 9, 1, 0, 0))).toBe('2026-10-01');
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-01', 7)).toBe('2026-10-08');
  });
});

describe('daysBetween', () => {
  it('counts calendar days either way, across month and year ends', () => {
    expect(daysBetween('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
    expect(daysBetween('2026-10-02', '2026-09-30')).toBe(-2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('counts whole days across a daylight-saving change', () => {
    // Europe and the US change their clocks in late March and early November.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('shortDate', () => {
  it('shows the weekday, day and month', () => {
    expect(shortDate('2026-09-17', '2026-10-01')).toBe('Thu 17 Sep');
  });

  it("adds the year when it isn't this year", () => {
    expect(shortDate('2027-01-04', '2026-12-30')).toBe('Mon 4 Jan 2027');
  });
});

describe('dayMonth', () => {
  it('shows the day and month, and the year when it isn’t this year', () => {
    expect(dayMonth('2026-09-12', '2026-10-01')).toBe('12 Sep');
    expect(dayMonth('2027-01-04', '2026-12-30')).toBe('4 Jan 2027');
  });
});
