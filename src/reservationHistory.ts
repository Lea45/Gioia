export type ReservationEventType =
  | "rezervacija"
  | "cekanje"
  | "promaknuto"
  | "otkazivanje"
  | "povrat_dolaska"
  | "admin_dolazak";

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value) {
    const toDateMethod = value.toDate;
    if (typeof toDateMethod === "function") {
      const converted = toDateMethod.call(value);
      return converted instanceof Date ? converted : null;
    }
  }
  return null;
};

const threeMonthsAgo = () => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
};

/**
 * Povijest se sprema u isti dokument rezervacije. Tako audit promjene ostaje
 * atomski zajedno sa statusom rezervacije i ne zahtijeva nova Firestore pravila.
 */
export const appendReservationHistory = (
  history: unknown,
  type: ReservationEventType,
  details: Record<string, unknown> = {}
) => {
  const previous = Array.isArray(history)
    ? history.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" &&
          entry !== null &&
          (() => {
            const createdAt = toDate(entry.createdAt);
            return !createdAt || createdAt >= threeMonthsAgo();
          })()
      )
    : [];

  const defaultAmount =
    type === "rezervacija" || type === "cekanje"
      ? -1
      : type === "povrat_dolaska"
      ? 1
      : undefined;

  return [
    ...previous,
    {
      type,
      ...(defaultAmount === undefined ? {} : { amount: defaultAmount }),
      ...details,
      createdAt: new Date(),
    },
  ];
};
