---
id: values-date-time
domain: D1
order: 3
title: Dates, Times, Periods, Durations & Time Zones
summary: The java.time types and which one to use, immutability, Period vs Duration, month-end arithmetic, Instant and the epoch, ZonedDateTime across daylight-saving gaps and overlaps, formatting patterns and parsing failures.
minutes: 60
objectives: [D1.3]
prerequisites: [values-primitives-operators]
contract:
  - Choose the right java.time type (LocalDate, LocalTime, LocalDateTime, Instant, ZonedDateTime, OffsetDateTime) for a requirement and state what each one cannot represent.
  - Predict the result of date arithmetic including month-end clamping, Period/Duration normalisation and their toString formats.
  - Predict what happens to a ZonedDateTime created in, or moved across, a daylight-saving gap or overlap, and explain why plusDays(1) and plusHours(24) can differ.
  - Read and write DateTimeFormatter patterns without confusing yyyy/YYYY, MM/mm and hh/HH, and recognise the exceptions thrown for invalid values and unparseable text.
keyRules:
  - All java.time types are immutable; plusX/minusX/withX return a new object. Ignoring the return value is a silent no-op.
  - "Factory methods only: LocalDate.of(2024, 1, 31), LocalDate.parse(\"2024-01-31\"), now(). There are no public constructors."
  - "Invalid values throw DateTimeException at runtime (LocalDate.of(2023, 2, 29), LocalTime.of(24, 0)); text that cannot be parsed throws DateTimeParseException."
  - "Adding months clamps to the last valid day: 2024-01-31 plus one month is 2024-02-29."
  - "Period = years, months, days (date-based, P1Y2M3D). Duration = seconds + nanos (time-based, PT1H30M). Period is not normalised automatically; Duration's toString shows hours, never days."
  - "In a DST gap, a local time that does not exist is shifted forward by the length of the gap; in an overlap the earlier offset is kept by default."
  - "ZonedDateTime.plusDays works on the local timeline (same wall-clock time); plusHours/plus(Duration) work on the instant timeline (exact elapsed time)."
  - "In patterns: y = year, Y = week-based year; M = month, m = minute; H = 0-23 hour, h = 1-12 hour (with a for AM/PM); D = day of year, d = day of month."
retrieval:
  - Draw a table of the six main java.time types showing whether each has a date, a time, an offset and a zone ID.
  - "State the toString of Period.ofMonths(14), Period.ofMonths(14).normalized(), Duration.ofMinutes(90) and Duration.ofDays(1)."
  - Explain what LocalDateTime 2:30 on the spring-forward day becomes in America/New_York and why.
  - "Name the two pattern-letter pairs that produce plausible-looking but wrong output when swapped."
checks: [D1-DT-002]
mastery: [D1-DT-004, D1-DT-005, D1-DT-006, D1-DT-008, D1-DT-009, D1-DT-010]
---

## Mental model: what does this value really describe?

java.time (the Date-Time API since Java 8) separates concepts that the old `java.util.Date` mixed up.
Ask: *does it have a date? a time? is it pinned to a point on the global timeline?*

| Type | Example `toString()` | Date | Time | Offset | Zone rules | A point on the timeline? |
|---|---|---|---|---|---|---|
| `LocalDate` | `2024-03-10` | ✓ | | | | no |
| `LocalTime` | `10:15` | | ✓ | | | no |
| `LocalDateTime` | `2024-03-10T10:15` | ✓ | ✓ | | | no |
| `OffsetDateTime` | `2024-03-10T10:15-05:00` | ✓ | ✓ | ✓ fixed | | yes |
| `ZonedDateTime` | `2024-03-10T10:15-04:00[America/New_York]` | ✓ | ✓ | ✓ | ✓ DST-aware | yes |
| `Instant` | `2024-03-10T14:15:00Z` | — seconds since 1970-01-01T00:00Z (UTC) — | | | | yes |

"Local" means *wall-clock values without a location*: "my birthday is March 10" is a `LocalDate`; it is a
different instant in Tunis and in Tokyo. An `Instant` is a count of seconds (+ nanoseconds) from the
**epoch** `1970-01-01T00:00:00Z`, always printed in UTC (`Z`).

Two amounts of time exist:

- `Period` — **date-based**: years, months and days, stored separately (`P1Y2M3D`). "One month" is not a
  fixed number of seconds.
- `Duration` — **time-based**: an exact number of seconds and nanoseconds (`PT1H30M`). "One day" in a
  `Duration` is exactly 24 hours.

Every one of these classes is **immutable** and **has no public constructor**: you use `of`, `parse`,
`now`, `from`, and the `plus/minus/with` methods that return new objects.

## Creating values and the immutability trap

```java predict
import java.time.*;
public class Main {
    public static void main(String[] args) {
        LocalDate d = LocalDate.of(2024, 1, 31);
        d.plusDays(1);                       // returns a new LocalDate that is thrown away
        System.out.println(d);
        System.out.println(d.plusMonths(1) + " " + d.plusMonths(1).plusMonths(1) + " " + d.plusMonths(2));
        System.out.println(LocalDate.of(2024, 2, 29).plusYears(1) + " " + LocalDate.of(2024, 3, 31).minusMonths(1));
        System.out.println(LocalTime.of(23, 30).plusHours(2) + " " + LocalDateTime.of(2024, 5, 1, 9, 0));
        LocalDate.of(2023, 2, 29);
    }
}
```
```output
2024-01-31
2024-02-29 2024-03-29 2024-03-31
2025-02-28 2024-02-29
01:30 2024-05-01T09:00
Exception in thread "main" java.time.DateTimeException: Invalid date 'February 29' as '2023' is not a leap year
```

Observe:

- **Month arithmetic clamps** to the end of the month: Jan 31 + 1 month = Feb 29 (2024 is a leap year).
  Applying `plusMonths(1)` twice gives **Mar 29**, but `plusMonths(2)` gives **Mar 31** — clamping loses
  information.
- `LocalTime` wraps around midnight silently (23:30 + 2h = 01:30), and `toString` omits zero seconds.
- Invalid field values fail at **runtime** with `DateTimeException`, not at compile time.
  `LocalDate.of(2024, 13, 1)` → *Invalid value for MonthOfYear (valid values 1 - 12): 13*.
- `new LocalDate()` does not compile — there is no accessible constructor.

> [!TRAP]
> `date.plusDays(1);` on its own line is the most common java.time trap on the exam. The object is
> unchanged; only `date = date.plusDays(1);` advances it.

## Period vs Duration

| Expression | `toString()` |
|---|---|
| `Period.of(1, 2, 3)` | `P1Y2M3D` |
| `Period.ofMonths(14)` | `P14M` — **not** normalised automatically |
| `Period.ofMonths(14).normalized()` | `P1Y2M` — only months↔years, never days |
| `Period.ofWeeks(2)` | `P14D` — weeks are stored as days |
| `Period.ZERO` | `P0D` |
| `Duration.ofMinutes(90)` | `PT1H30M` |
| `Duration.ofSeconds(3661)` | `PT1H1M1S` |
| `Duration.ofDays(1)` / `ofHours(25)` | `PT24H` / `PT25H` — Duration never prints days |
| `Duration.ofMillis(1500)` | `PT1.5S` |
| `Duration.ofSeconds(-90)` | `PT-1M-30S` |

Which type works with which temporal:

- `Period` adds days/months/years: OK on `LocalDate`, `LocalDateTime`, `ZonedDateTime`. On `LocalTime`
  it throws `UnsupportedTemporalTypeException: Unsupported unit: Days`. On an `Instant`, `Period.ofDays`
  works (a day = 86 400 s) but `Period.ofMonths` throws.
- `Duration` adds seconds: OK on anything with a time. On `LocalDate` it throws
  `UnsupportedTemporalTypeException: Unsupported unit: Seconds`.

Measuring the distance between two values:

```java predict
import java.time.*;
import java.time.temporal.ChronoUnit;
public class Main {
    public static void main(String[] args) {
        LocalDate a = LocalDate.of(2024, 1, 31), b = LocalDate.of(2024, 3, 1);
        System.out.println(Period.between(a, b));
        System.out.println(ChronoUnit.MONTHS.between(a, LocalDate.of(2024, 2, 29)));
        System.out.println(ChronoUnit.DAYS.between(a, b) + " " + a.until(b, ChronoUnit.DAYS));
        System.out.println(Duration.between(LocalTime.of(10, 0), LocalTime.of(8, 30)));
        System.out.println(Period.ofMonths(12).equals(Period.ofYears(1)) + " " + Duration.ofHours(24).equals(Duration.ofDays(1)));
        System.out.println(Duration.between(a, b));
    }
}
```
```output
P1M1D
0
30 30
PT-1H-30M
false true
Exception in thread "main" java.time.temporal.UnsupportedTemporalTypeException: Unsupported unit: Seconds
```

- `Period.between` counts whole months first, then the remaining days: Jan 31 + 1 month is Feb 29
  (clamped), and Feb 29 → Mar 1 is one more day, so `P1M1D`. The end date is **exclusive**.
- `ChronoUnit.MONTHS.between(Jan 31, Feb 29)` is `0`: a "complete month" would need Feb 31.
- `Duration.between` can be negative.
- `Period.ofMonths(12)` and `Period.ofYears(1)` are **not equal** — Period compares each field.
- `Duration.between` needs seconds; two `LocalDate`s have none.

::check D1-DT-003

## Instants, offsets and zones

```java
Instant.ofEpochSecond(0)                         // 1970-01-01T00:00:00Z
Instant.EPOCH.plus(Duration.ofMillis(1500))     // 1970-01-01T00:00:01.500Z
OffsetDateTime.of(2024,1,1,10,0,0,0, ZoneOffset.ofHours(2)).toInstant()      // 2024-01-01T08:00:00Z
ZonedDateTime.of(2024,6,1,12,0,0,0, ZoneId.of("Europe/Paris")).toInstant()  // 2024-06-01T10:00:00Z (summer, +02:00)
zdt.withZoneSameInstant(other)   // same moment, different wall clock
zdt.withZoneSameLocal(other)     // same wall clock, different moment
```

A `ZoneOffset` such as `+02:00` is a fixed number; a `ZoneId` such as `Europe/Paris` is a **rule set**
that yields `+01:00` in winter and `+02:00` in summer. Always use region IDs, never the system default, in
code that must be predictable.

## Daylight-saving transitions

Twice a year the local clock jumps. In `America/New_York` (2024): on **March 10**, 02:00 jumps to 03:00 (a
one-hour **gap** — local times 02:00–02:59 do not exist). On **November 3**, 02:00 falls back to 01:00 (an
**overlap** — 01:00–01:59 happen twice). `Europe/Paris` changed on March 31 and October 27, 2024, at 02:00
and 03:00 local time.

The rules `ZonedDateTime` applies:

1. **Gap:** a local date-time that does not exist is moved **forward by the length of the gap**
   (02:30 → 03:30, offset −04:00).
2. **Overlap:** the **earlier** offset (the summer one) is kept by default; `withLaterOffsetAtOverlap()`
   selects the other.
3. `plusDays`, `plusMonths`, `plus(Period)` operate on the **local** date-time and then re-resolve the
   zone: the wall-clock time stays the same, so the elapsed time can be 23 or 25 hours.
4. `plusHours`, `plusMinutes`, `plus(Duration)` operate on the **instant**: exactly that much time
   passes, and the wall clock may show a different hour.

```java predict
import java.time.*;
public class Main {
    public static void main(String[] args) {
        ZoneId ny = ZoneId.of("America/New_York");
        ZonedDateTime gap = ZonedDateTime.of(LocalDateTime.of(2024, 3, 10, 2, 30), ny);
        System.out.println(gap);
        ZonedDateTime noon = ZonedDateTime.of(2024, 3, 9, 12, 0, 0, 0, ny);
        System.out.println(noon.plusDays(1));
        System.out.println(noon.plusHours(24));
        System.out.println(Duration.between(noon, noon.plusDays(1)));
        ZonedDateTime overlap = ZonedDateTime.of(LocalDateTime.of(2024, 11, 3, 1, 30), ny);
        System.out.println(overlap + " " + overlap.plusHours(1));
    }
}
```
```output
2024-03-10T03:30-04:00[America/New_York]
2024-03-10T12:00-04:00[America/New_York]
2024-03-10T13:00-04:00[America/New_York]
PT23H
2024-11-03T01:30-04:00[America/New_York] 2024-11-03T01:30-05:00[America/New_York]
```

The day of the spring transition is 23 hours long: `plusDays(1)` keeps "noon", `plusHours(24)` lands at
13:00. In the overlap, adding one hour to 01:30 EDT gives 01:30 **EST** — same wall clock, an hour later.

> [!TRAP]
> `Duration.between(start, start.plusDays(1))` is **not** always `PT24H` for a `ZonedDateTime`. It is
> `PT23H` across spring-forward and `PT25H` across fall-back. For `LocalDateTime` it is always 24 hours —
> local types know nothing about DST.

::check D1-DT-007

## Formatting and parsing

`DateTimeFormatter.ofPattern(...)` builds a formatter (pass an explicit `Locale` for month/day names).
Predefined ones such as `DateTimeFormatter.ISO_LOCAL_DATE` match the default `toString()`/`parse()` format.

| Letter | Meaning | Example for 2024-07-04T15:05 |
|---|---|---|
| `yyyy` / `uuuu` | year | `2024` |
| `YYYY` | **week-based** year (differs in the last days of December / first days of January) | `2024` |
| `MM` / `MMM` / `MMMM` | month: number / short name / full name | `07` / `Jul` / `July` |
| `mm` | **minute** | `05` |
| `dd` / `d` | day of month (2-digit / minimal) | `04` / `4` |
| `D` | **day of year** | `186` |
| `HH` | hour 0–23 | `15` |
| `hh` + `a` | hour 1–12 + AM/PM | `03 PM` |
| `EEEE` | day-of-week name | `Thursday` |
| `'text'` | literal text (`''` for a single quote) | |

```java predict
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
public class Main {
    public static void main(String[] args) {
        LocalDateTime t = LocalDateTime.of(2024, 12, 30, 15, 5);
        System.out.println(t.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.US)));
        System.out.println(t.format(DateTimeFormatter.ofPattern("YYYY-mm-dd hh:mm a", Locale.US)));
        System.out.println(LocalDate.parse("05/03/2024", DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.US)));
        LocalDate.parse("2024-1-5");
    }
}
```
```output
2024-12-30 15:05
2025-05-30 03:05 PM
2024-03-05
Exception in thread "main" java.time.format.DateTimeParseException: Text '2024-1-5' could not be parsed at index 5
```

The second line has two bugs that compile and run happily: `YYYY` printed the week-based year (December 30,
2024 belongs to week 1 of 2025) and `mm` printed minutes where the month was intended.

Parsing problems throw `DateTimeParseException` (a subclass of `DateTimeException`): wrong layout
(`"2024-1-5"` needs two-digit month and day for `ISO_LOCAL_DATE`) or an invalid date (`"2024-02-30"`).
Formatting a `LocalDate` with a pattern that contains `HH` throws `UnsupportedTemporalTypeException:
Unsupported field: HourOfDay` — a date has no hour.

## Comparisons and adjusters

`isBefore`, `isAfter` and `isEqual` compare on the timeline (`d.isBefore(d)` is `false`). `equals` on a
`ZonedDateTime` also compares the zone, while `isEqual` compares only the instant.

`TemporalAdjusters` (plural; in `java.time.temporal`) supplies common "jumps" for `with(...)`:

```java
LocalDate d = LocalDate.of(2025, 5, 14);                   // a Wednesday
d.with(TemporalAdjusters.lastDayOfMonth())                  // 2025-05-31
d.with(TemporalAdjusters.next(DayOfWeek.WEDNESDAY))         // 2025-05-21 — strictly after
d.with(TemporalAdjusters.nextOrSame(DayOfWeek.WEDNESDAY))   // 2025-05-14 — may be today
d.with(TemporalAdjusters.firstDayOfNextMonth())             // 2025-06-01
```

## What if…? One change at a time

| Change | Result |
|---|---|
| `d.plusDays(1);` → `d = d.plusDays(1);` | `d` actually changes |
| `LocalDate.of(2024, 1, 31).plusMonths(1)` → 2023 | `2023-02-28` |
| `Period.ofMonths(14)` → `.normalized()` | `P14M` → `P1Y2M` |
| `Duration.ofHours(36)` printed | `PT36H` (no days) |
| `noon.plusDays(1)` → `noon.plusHours(24)` across spring-forward | wall clock 13:00 instead of 12:00 |
| `ZoneId.of("America/New_York")` → `ZoneOffset.ofHours(-5)` | no DST at all; 02:30 stays 02:30 |
| pattern `MM` → `mm` | minute printed where month was meant |
| pattern `yyyy` → `YYYY` on Dec 30, 2024 | prints 2025 |
| `LocalDate.plus(Duration.ofDays(1))` | `UnsupportedTemporalTypeException` |

## Exam traps checklist

> [!TRAP]
> - Months are 1-based (`LocalDate.of(2024, 1, 1)` is January) and `Month.JANUARY` can be used instead.
> - `LocalTime.of(24, 0)` throws; midnight is `LocalTime.MIDNIGHT` (`00:00`).
> - `Period.of(1, 15, 40)` is legal and prints `P1Y15M40D`; `normalized()` gives `P2Y3M40D` (days untouched).
> - `Period.ofYears(1).ofMonths(2)` calls a **static** method through an instance: the result is `P2M`, not `P1Y2M`. Chain with `withMonths`/`plusMonths` instead.
> - `Instant` has no year/month fields: `instant.plus(Period.ofMonths(1))` throws.
> - Converting a `LocalDateTime` to a `ZonedDateTime` can **change** the local time (gap) — `atZone(...)` is not a pure label.

## Practice

::check D1-DT-001

::check D1-DT-011
