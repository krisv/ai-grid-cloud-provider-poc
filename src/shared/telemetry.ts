// Replaceable standalone analytics boundary. No events leave the browser.
export const fireFormTrackingEvent = (_event: string, _properties: unknown): void => {};
export const fireMiscTrackingEvent = (_event: string, _properties: unknown): void => {};
