export function browserTarget() {
  const browserArg = process.argv.find((arg) => arg.startsWith("--browser="));
  const value = (browserArg ? browserArg.split("=", 2)[1] : process.env.MOOFLIGHTS_BROWSER || "chrome").toLowerCase();
  if (value === "chrome" || value === "firefox") return value;
  throw new Error(`Unsupported browser target "${value}". Expected "chrome" or "firefox".`);
}
