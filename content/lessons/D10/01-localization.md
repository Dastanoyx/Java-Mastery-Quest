---
id: l10n-locales-bundles
domain: D10
order: 1
title: Localization — Locales, Resource Bundles and Locale-Sensitive Formatting
summary: Build Locale objects the modern way, predict exactly which resource bundle and which value ResourceBundle.getBundle returns (including the default-locale fallback), and format and parse messages, numbers, currencies, percentages and dates for a locale.
minutes: 65
objectives: [D10.1]
prerequisites: [io-streams]
contract:
  - Create locales with Locale.of, Locale.forLanguageTag, constants and Locale.Builder, and predict their toString and toLanguageTag forms.
  - Write the exact candidate list ResourceBundle.getBundle searches for a requested locale, including the default-locale step, and predict which bundle is chosen and where each key comes from.
  - Distinguish property-file bundles from ListResourceBundle classes, and predict MissingResourceException.
  - Format messages with MessageFormat, including argument types and apostrophe quoting.
  - Format and parse numbers, currencies, percentages and compact numbers with NumberFormat and DecimalFormat, including rounding and partial parsing.
  - Format dates and times with localized FormatStyles and locale-specific month and day names.
keyRules:
  - "Locale.of(language[, country[, variant]]) (Java 19) replaces the deprecated Locale constructors; Locale.forLanguageTag parses IETF BCP 47 tags with hyphens (fr-CA), and an unparsable tag such as fr_CA yields an empty locale part."
  - "Locale.toString() uses underscores (fr_CA); toLanguageTag() uses hyphens (fr-CA). Language is normalized to lower case, country to upper case."
  - "getBundle(base, L) searches base_lang_COUNTRY_variant, base_lang_COUNTRY, base_lang, then — only if none of those exists — the same list for the DEFAULT locale, and finally the base bundle."
  - "A bundle's parent chain only follows the candidate list of the locale that produced it: a key missing in Msg_fr_CA is looked up in Msg_fr and then Msg — never in the default-locale bundle."
  - "For the same candidate name, a class (ListResourceBundle) is found before a .properties file."
  - "A key missing from the whole parent chain ⇒ MissingResourceException (unchecked); a bundle that cannot be found at all ⇒ MissingResourceException from getBundle."
  - "MessageFormat: {index[,type[,style]]}; a single apostrophe starts quoted text, so ' must be written ''; a placeholder without an argument is printed as-is."
  - "NumberFormat.parse reads as far as it can and ignores the rest; it throws ParseException only if nothing at the start could be parsed."
  - "NumberFormat and DecimalFormat round HALF_EVEN by default; Formatter (String.format) rounds HALF_UP."
  - "In DecimalFormat patterns, 0 always prints a digit (padding with zeros) and # prints a digit only if it is significant."
retrieval:
  - Write the full list of bundle names getBundle("Msg", Locale.of("de","CH")) tries when the default locale is en_US.
  - Explain why a key present only in Msg_en.properties can be missing for a request of fr_CA even when the default locale is English.
  - Give the output of MessageFormat.format("Don't {0}", "x") and explain it.
  - Predict NumberFormat.getInstance(Locale.US).parse("12.5kg") and parse("kg12.5").
checks: [D10-L10N-001, D10-L10N-002, D10-L10N-003, D10-L10N-004, D10-L10N-005, D10-L10N-006, D10-L10N-007]
mastery: [D10-L10N-008, D10-L10N-009, D10-L10N-010, D10-L10N-011, D10-L10N-012, D10-L10N-013, D10-L10N-014, D10-L10N-015, D10-L10N-016, D10-L10N-017, D10-L10N-018, D10-L10N-019]
---

## Mental model: one program, many audiences

**Internationalization (i18n)** is designing a program so that nothing language- or region-specific is
hard-coded; **localization (l10n)** is supplying those specifics for one audience. The audience is
described by a `java.util.Locale`:

| Part | Example | Normalized as | Source |
|---|---|---|---|
| language | `fr` | lower case, ISO 639 | required |
| script | `Latn`, `Hant` | title case, ISO 15924 | optional |
| country / region | `CA` | upper case, ISO 3166 or UN M.49 | optional |
| variant | `POSIX` | as given | optional |

Two kinds of things depend on the locale: **text you write** (labels, messages → resource bundles) and
**data the JDK formats** (numbers, currencies, dates → `NumberFormat`, `DateTimeFormatter`,
`MessageFormat`). Since Java 9, the JDK's formatting data comes from the Unicode **CLDR** project, so the
exact output (including special space characters) can change between JDK releases — the exam focuses on
the API rules, and every output shown here was verified on JDK 25.

## Creating locales

```java predict
import java.util.Locale;

public class Main {
    public static void main(String[] args) {
        Locale a = Locale.of("fr", "CA");                               // Java 19+
        Locale b = Locale.forLanguageTag("fr-CA");                      // IETF BCP 47 tag
        Locale c = Locale.CANADA_FRENCH;                                // constant
        Locale d = new Locale.Builder().setLanguage("fr").setRegion("CA").build();
        System.out.println(a + " " + a.toLanguageTag() + " " + a.equals(b) + b.equals(c) + c.equals(d));

        System.out.println(Locale.of("EN", "gb") + " " + Locale.GERMAN + " " + Locale.GERMANY);
        Locale bad = Locale.forLanguageTag("fr_CA");                    // underscore: not a valid tag
        System.out.println("[" + bad + "] " + bad.getLanguage().isEmpty());
        System.out.println(a.getDisplayName() + " / " + a.getDisplayName(Locale.FRENCH));
        System.out.println(Locale.getDefault());
    }
}
```
```output
fr_CA fr-CA truetruetrue
en_GB de de_DE
[] true
French (Canada) / français (Canada)
en_US
```

- `Locale.of(...)` (**Java 19**) is the modern factory. The `new Locale(...)` constructors are
  **deprecated since Java 19** — they still compile (with a warning), but prefer `of`.
- `Locale.forLanguageTag` expects **hyphens**. `"fr_CA"` is not well-formed, so the result is the empty
  root-like locale — no exception.
- Constants: `Locale.US`, `UK`, `CANADA`, `CANADA_FRENCH`, `FRANCE`, `GERMANY`, `ITALY`, `JAPAN`, `CHINA`,
  `KOREA`… (language + country) and `ENGLISH`, `FRENCH`, `GERMAN`, `ITALIAN`… (language only); `Locale.ROOT`
  is the empty locale.
- `Locale.Builder` validates each part and throws `IllformedLocaleException` for invalid values.

**The default locale.** `Locale.getDefault()` comes from the system (here `en_US`, set with
`-Duser.language=en -Duser.country=US`). `Locale.setDefault(l)` changes it for the running JVM. Since
Java 7 there are two **categories**: `Locale.Category.DISPLAY` (language of the UI, used by
`getDisplayName()` and resource bundles) and `Locale.Category.FORMAT` (used by `NumberFormat`,
`DateTimeFormatter`, `String.format`…). `Locale.setDefault(Category, l)` changes only one;
`setDefault(l)` changes both.

```java predict
import java.text.NumberFormat;
import java.util.Locale;

public class Main {
    public static void main(String[] args) {
        Locale.setDefault(Locale.Category.FORMAT, Locale.GERMANY);
        System.out.println(Locale.getDefault() + " " + Locale.getDefault(Locale.Category.FORMAT));
        System.out.println(NumberFormat.getInstance().format(1234.5) + " " + Locale.FRANCE.getDisplayCountry());
    }
}
```
```output
en_US de_DE
1.234,5 France
```

::check D10-L10N-001

## Resource bundles: where translated text lives

A **resource bundle family** shares a *base name*; each member adds a locale suffix:

```properties
# Messages.properties          — the base (root) bundle
greeting=Hello
farewell=Goodbye
# Messages_fr.properties
greeting=Bonjour
# Messages_fr_CA.properties
greeting=Allô
```

```java
ResourceBundle rb = ResourceBundle.getBundle("Messages", Locale.of("fr", "CA"));
rb.getString("greeting");   // "Allô"      (from Messages_fr_CA)
rb.getString("farewell");   // "Goodbye"   (inherited from the base bundle via the parent chain)
```

Property files: `key=value`, `key:value` or `key value`; `#` and `!` start comments; a trailing `\` continues
a line; keys are case-sensitive. Since Java 9, `.properties` bundles are read as **UTF-8**. `getString`
returns `String`; `getObject` returns `Object`; `keySet()` contains the keys of the bundle **and its
parents**; `containsKey` checks the whole chain.

### The lookup algorithm

For `getBundle("Msg", requested)` with the default locale `en_US`:

1. **Candidate list of the requested locale**, most specific first — for `fr_CA`:
   `Msg_fr_CA`, `Msg_fr`. (With a variant or script, more specific names come first.)
2. **Only if none of those exists**: the candidate list of the **default locale** — `Msg_en_US`, `Msg_en`.
3. Finally the **base bundle** `Msg`.
4. Nothing at all ⇒ `MissingResourceException: Can't find bundle for base name Msg, locale fr_CA`.

> [!RULE]
> Candidate order for `getBundle(base, requested)`: `base_lang_COUNTRY_variant` → `base_lang_COUNTRY` →
> `base_lang` → *(only if none found)* the same names for the **default** locale → `base`. For each name,
> a class is tried before a `.properties` file.

The first bundle found is the result. Its **parent chain** consists of the *later* names of the **same**
candidate list, ending at the base bundle: `Msg_fr_CA → Msg_fr → Msg`. A key missing in the result
bundle is looked up along that chain. The default-locale bundles are never in the parent chain of a
requested-locale bundle.

> [!TRAP]
> Requesting `Locale.ITALY` when only `Msg.properties` and `Msg_en.properties` exist does **not** return the
> base bundle: no `Msg_it…` exists, so the **default locale** (`en_US`) is tried and `Msg_en` wins. Every key
> then comes from `Msg_en` (falling back to `Msg`). Many developers expect the neutral base bundle here.

For each candidate name, a **class** of that name (a `ResourceBundle` subclass such as `ListResourceBundle`)
is tried **before** a `.properties` file. Java-class bundles can hold any object, not just strings:

```java predict
import java.util.*;

class Labels extends ListResourceBundle {
    public Labels() { }
    protected Object[][] getContents() {
        return new Object[][] { {"hello", "Hello"}, {"bye", "Goodbye"}, {"vat", 0.2} };
    }
}
class Labels_en extends ListResourceBundle {
    public Labels_en() { }
    protected Object[][] getContents() { return new Object[][] { {"hello", "Hi"} }; }
}
class Labels_fr extends ListResourceBundle {
    public Labels_fr() { }
    protected Object[][] getContents() { return new Object[][] { {"hello", "Salut"}, {"bye", "Au revoir"} }; }
}
class Labels_fr_CA extends ListResourceBundle {
    public Labels_fr_CA() { }
    protected Object[][] getContents() { return new Object[][] { {"hello", "Allô"} }; }
}

public class Main {
    static void show(Locale requested) {
        ResourceBundle rb = ResourceBundle.getBundle("Labels", requested);
        System.out.println(requested + " -> " + rb.getClass().getSimpleName() + ": "
            + rb.getString("hello") + " / " + rb.getString("bye") + " / " + rb.getObject("vat"));
    }
    public static void main(String[] args) {
        show(Locale.of("fr", "CA"));
        show(Locale.of("fr", "BE"));
        show(Locale.of("de", "DE"));
        show(Locale.ROOT);
        Locale.setDefault(Locale.of("fr"));
        show(Locale.of("de", "DE"));
    }
}
```
```output
fr_CA -> Labels_fr_CA: Allô / Au revoir / 0.2
fr_BE -> Labels_fr: Salut / Au revoir / 0.2
de_DE -> Labels_en: Hi / Goodbye / 0.2
 -> Labels: Hello / Goodbye / 0.2
de_DE -> Labels_fr: Salut / Au revoir / 0.2
```

- `fr_CA`: found `Labels_fr_CA`; `bye` comes from its parent `Labels_fr`, `vat` from `Labels`.
- `fr_BE`: no `Labels_fr_BE`, so `Labels_fr` is the result.
- `de_DE`: no German bundle ⇒ default locale `en_US` ⇒ `Labels_en`.
- `Locale.ROOT`: the candidate list is just the base bundle.
- After `Locale.setDefault(fr)`, the same German request now lands on `Labels_fr`.

> [!NOTE]
> Class bundles must be loadable by name and have a **public no-arg constructor** — `getBundle`
> instantiates them reflectively. `getString` on a non-`String` value (`"vat"` above) throws
> `ClassCastException`; use `getObject`.

::check D10-L10N-002

::check D10-L10N-003

**Missing keys.** `getString("nope")` when no bundle in the chain has the key throws
`MissingResourceException` (unchecked, in `java.util`), with `getKey()` and `getClassName()` describing
what was missing. Bundles are cached; `ResourceBundle.clearCache()` discards the cache.

## MessageFormat: sentences with placeholders

Translators need whole sentences with holes, because word order differs between languages.
`java.text.MessageFormat` uses numbered placeholders `{index}` or `{index,type,style}` with types
`number` (styles `integer`, `currency`, `percent` or a pattern), `date`, `time` and `choice`:

```java predict
import java.text.MessageFormat;
import java.util.Locale;

public class Main {
    public static void main(String[] args) {
        System.out.println(MessageFormat.format("{1} owes {0} {2}.", "Ana", "Ben", 1234567));
        System.out.println(MessageFormat.format("{0,number,percent} of {1,number,integer} tickets", 0.256, 1500.5));
        System.out.println(MessageFormat.format("It's {0}", "late"));
        System.out.println(MessageFormat.format("It''s {0}, use '{0}' or {1}", "late"));
        var mf = new MessageFormat("{0,number} / {0}", Locale.GERMANY);
        System.out.println(mf.format(new Object[] { 9876.5 }));
    }
}
```
```output
Ben owes Ana 1,234,567.
26% of 1,500 tickets
Its {0}
It's late, use {0} or {1}
9.876,5 / 9.876,5
```

- Arguments are used by **index**, in any order and any number of times.
- Numbers are formatted with the format's locale even without `,number` (`1,234,567`); `integer` rounds
  (HALF_EVEN) — `1500.5` → `1,500`.
- A single apostrophe **starts a quoted section**: everything until the next `'` is literal, so `It's {0}`
  prints `Its {0}` — the apostrophe is swallowed and the placeholder is quoted. Write `''` for a real
  apostrophe and `'{0}'` for a literal `{0}`.
- A placeholder whose argument is missing (`{1}`) is printed unchanged — no exception.
- The static `MessageFormat.format` uses the default `FORMAT` locale; `new MessageFormat(pattern, locale)`
  chooses one.

::check D10-L10N-004

## Numbers, currencies and percentages

`java.text.NumberFormat` factories all take an optional `Locale` (default: the `FORMAT` default locale):

| Factory | 1234.567 in `en_US` | in `de_DE` |
|---|---|---|
| `getInstance()` / `getNumberInstance()` | `1,234.567` (max 3 fraction digits) | `1.234,567` |
| `getIntegerInstance()` | `1,235` (rounds; `parse` stops at the decimal point) | `1.235` |
| `getCurrencyInstance()` | `$1,234.57` | `1.234,57 €` (with a no-break space) |
| `getPercentInstance()` on 0.256 | `26%` (×100) | `26 %` (no-break space) |
| `getCompactNumberInstance(locale, Style.SHORT/LONG)` (Java 12) on 1_250_000 | `1M` / `1 million` | `1 Mio.` (no-break space) / `1 Million` |

CLDR data uses **invisible special spaces**: `U+00A0` (no-break space) before `€` and `%` in German and
French, and `U+202F` (narrow no-break space) as the French thousands separator and before `AM`/`PM` in
English times. Comparing such output with a string typed with an ordinary space fails. The program below
makes them visible by replacing `U+00A0` with `_` and `U+202F` with `~`:

```java predict
import java.text.NumberFormat;
import java.util.Locale;

public class Main {
    static String visible(String s) { return s.replace(' ', '_').replace(' ', '~'); }
    public static void main(String[] args) {
        double amount = 1234.5;
        for (Locale l : new Locale[] { Locale.US, Locale.GERMANY, Locale.FRANCE, Locale.JAPAN }) {
            System.out.println(l + " " + visible(NumberFormat.getInstance(l).format(amount)) + " | "
                + visible(NumberFormat.getCurrencyInstance(l).format(amount)) + " | "
                + visible(NumberFormat.getPercentInstance(l).format(0.075)));
        }
        var compact = NumberFormat.getCompactNumberInstance(Locale.US, NumberFormat.Style.SHORT);
        System.out.println(compact.format(1_250_000) + " " + compact.format(1_550) + " " + compact.format(999));
    }
}
```
```output
en_US 1,234.5 | $1,234.50 | 8%
de_DE 1.234,5 | 1.234,50_€ | 8_%
fr_FR 1~234,5 | 1~234,50_€ | 8_%
ja_JP 1,234.5 | ￥1,234 | 8%
1M 2K 999
```

Rounding is **HALF_EVEN** ("banker's rounding"): `0.075` → `7.5%` → `8%` because 8 is even, while
`0.065` would give `6%`. The yen has no fraction digits, so `1234.5` → `￥1,234`.

> [!NOTE]
> `getCompactNumberInstance` is Java 12; `NumberFormat.Style` values are `SHORT` and `LONG`. Compact
> formats round to whole units by default (`1_550` → `2K`); call `setMaximumFractionDigits(1)` for `1.6K`.

**Parsing** goes the other way and is lenient in a specific way: `parse(String)` reads from the beginning
as far as the text matches the format, **ignores the rest**, and throws the checked
`java.text.ParseException` only when **nothing** could be parsed at the start. It returns a `Long` when the
value is integral, otherwise a `Double`.

```java predict
import java.text.*;
import java.util.Locale;

public class Main {
    static void parse(NumberFormat f, String s) {
        try {
            Number n = f.parse(s);
            System.out.println(s + " -> " + n + " " + n.getClass().getSimpleName());
        } catch (ParseException e) {
            System.out.println(s + " -> ParseException at " + e.getErrorOffset());
        }
    }
    public static void main(String[] args) {
        NumberFormat us = NumberFormat.getInstance(Locale.US);
        NumberFormat de = NumberFormat.getInstance(Locale.GERMANY);
        parse(us, "1,234.50 EUR");
        parse(de, "1,234.50");
        parse(us, "4.0");
        parse(us, "x42");
        parse(NumberFormat.getCurrencyInstance(Locale.US), "42.00");
        parse(NumberFormat.getPercentInstance(Locale.US), "12.5%");
        parse(NumberFormat.getIntegerInstance(Locale.US), "7.9");
    }
}
```
```output
1,234.50 EUR -> 1234.5 Double
1,234.50 -> 1.234 Double
4.0 -> 4 Long
x42 -> ParseException at 0
42.00 -> ParseException at 0
12.5% -> 0.125 Double
7.9 -> 7 Long
```

The German format reads `,` as the decimal separator, so `"1,234"` is one point two three four; the `.50`
that follows cannot continue a number after its fraction, so parsing stops and the result is `1.234`.
A currency format requires the currency symbol; a percent format divides by 100; an integer format stops
at the decimal point.

::check D10-L10N-005

## DecimalFormat patterns

`DecimalFormat` (the concrete `NumberFormat` behind most factories) accepts a pattern:

| Symbol | Meaning |
|---|---|
| `0` | a digit, printed even if it is a (leading/trailing) zero |
| `#` | a digit, omitted if it is not significant |
| `.` | decimal separator (localized on output) |
| `,` | grouping separator; the group size is the number of digits between the last `,` and the end of the integer part |
| `%` | multiply by 100 and show a percent sign |
| `'…'` | quoted literal text |

```java predict
import java.text.DecimalFormat;

public class Main {
    public static void main(String[] args) {
        double[] values = { 7.5, 1234.567, 0.125 };
        String[] patterns = { "000.00", "#.##", "#,##0.0#", "0.#%" };
        for (String p : patterns) {
            var f = new DecimalFormat(p);
            StringBuilder sb = new StringBuilder(p + " ->");
            for (double v : values) sb.append(' ').append(f.format(v));
            System.out.println(sb);
        }
    }
}
```
```output
000.00 -> 007.50 1234.57 000.12
#.## -> 7.5 1234.57 0.12
#,##0.0# -> 7.5 1,234.57 0.12
0.#% -> 750% 123456.7% 12.5%
```

Read the rows column by column:

- `000.00` pads the integer part to three digits and always shows two decimals: `007.50`. A pattern never
  truncates the integer part, so `1234.57` keeps all four digits.
- `#.##` drops the insignificant trailing zero of `7.50` and prints `0.12` for `0.125`. Where does the
  leading `0` come from? A pattern containing no `0` at all is treated as if its last integer `#` were a
  `0` (`#.##` behaves like `0.##`). A pattern that does contain zeros, such as `#.00`, prints `.12`.
- `0.125` → `0.12`, not `0.13`: `DecimalFormat` rounds **HALF_EVEN** and `0.125` is exactly representable
  as a `double`, so the tie goes to the even digit `2`.
- In `#,##0.0#` the grouping size is 3 (digits after the last `,`), so `1234.567` → `1,234.57`.
- `%` multiplies by 100 *before* applying the digit rules.

::check D10-L10N-007

## Dates and times for a locale

`DateTimeFormatter` (java.time) offers localized formats chosen by `FormatStyle` — `SHORT`, `MEDIUM`,
`LONG`, `FULL` — in the default `FORMAT` locale, or in any locale via `withLocale`. `ofPattern(pattern,
locale)` gives a custom pattern with localized names: `MMMM` = full month name, `MMM` = abbreviated,
`EEEE` = full day name, `EEE` = abbreviated.

```java predict
import java.time.LocalDate;
import java.time.format.*;
import java.util.Locale;

public class Main {
    public static void main(String[] args) {
        LocalDate d = LocalDate.of(2025, 3, 7);
        for (Locale l : new Locale[] { Locale.US, Locale.UK, Locale.GERMANY }) {
            System.out.println(l + ": "
                + d.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.SHORT).withLocale(l)) + " | "
                + d.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(l)));
        }
        System.out.println(d.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)));
        System.out.println(d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRANCE)) + " | "
            + d.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.of("es"))));
    }
}
```
```output
en_US: 3/7/25 | March 7, 2025
en_GB: 07/03/2025 | 7 March 2025
de_DE: 07.03.25 | 7. März 2025
Friday, March 7, 2025
vendredi 7 mars | vie, mar 7
```

> [!TRAP]
> `ofLocalizedDateTime(FormatStyle.FULL)` or `LONG` on a `LocalDateTime` throws `DateTimeException` —
> those styles include a **time zone**, which a `LocalDateTime` does not have. Use a `ZonedDateTime`, or
> `MEDIUM`/`SHORT`. Also note that English short and medium **times** contain `U+202F` before `AM`/`PM`
> since JDK 20 (CLDR 42): `2:05 PM` is not `"2:05 PM"` with a normal space.

## String.format, formatted and the console

`String.format(Locale, fmt, args…)`, `"…".formatted(args…)` (default locale) and `printf` use
`java.util.Formatter`: `%,.2f` adds the locale's grouping separator, and the decimal separator follows the
locale. Unlike `NumberFormat`, `Formatter` rounds **HALF_UP**:

```java
String.format(Locale.GERMANY, "%,.2f", 1234.5);   // 1.234,50
String.format(Locale.FRANCE, "%.1f", 2.25);       // 2,3   (HALF_UP)
NumberFormat f = NumberFormat.getInstance(Locale.FRANCE);
f.setMaximumFractionDigits(1);
f.format(2.25);                                   // 2,2   (HALF_EVEN)
```

> [!J25]
> Since **Java 23**, `java.io.Console` has `format(Locale, …)`, `printf(Locale, …)`, `readLine(Locale, …)`
> and `readPassword(Locale, …)` overloads, so a prompt can be formatted for a specific locale without
> changing the default.

## What if…? One change at a time

| Change | Result |
|---|---|
| `Locale.forLanguageTag("fr_CA")` | empty locale — tags use hyphens |
| `new Locale("fr", "CA")` | compiles with a deprecation warning (Java 19+); same value as `Locale.of` |
| Remove `Msg_fr.properties` and request `fr_FR` (default `en_US`, `Msg_en` exists) | `Msg_en` is used, not `Msg` |
| Add `Msg_fr.class` next to `Msg_fr.properties` | the class wins |
| Key missing in every bundle of the chain | `MissingResourceException` |
| `MessageFormat.format("Don't {0}", x)` | `Dont {0}` — write `Don''t` |
| Parse `"12abc"` with `NumberFormat` | `12` (rest ignored); `"abc12"` ⇒ `ParseException` |
| Pattern `"#.00"` on `0.5` | `.50` — `#` prints no leading zero |
| `getIntegerInstance().format(2.5)` | `2` (HALF_EVEN); `3.5` → `4` |

## Exam traps checklist

> [!TRAP]
> - `Locale.of` / `forLanguageTag("xx-YY")` / constants / `Builder` — not `new Locale` (deprecated) and not `forLanguageTag("xx_YY")`.
> - Lookup: requested locale's candidates → **default locale's** candidates → base. The default step only happens if nothing more specific than the base was found.
> - The parent chain never contains default-locale bundles.
> - Classes beat `.properties` files with the same name.
> - `getString` on a missing key ⇒ `MissingResourceException` (unchecked); `NumberFormat.parse` ⇒ `ParseException` (checked).
> - `MessageFormat` swallows single apostrophes.
> - `NumberFormat` rounds HALF_EVEN; `String.format` rounds HALF_UP.
> - Localized CLDR output may contain U+00A0 / U+202F instead of ordinary spaces.

## Practice

::check D10-L10N-006

::exercise D10-EX-001
