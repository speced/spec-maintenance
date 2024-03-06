// For use in the static site generator.
export const englishUtcFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
});

// For use in client-side code.
export const localFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long"
});
