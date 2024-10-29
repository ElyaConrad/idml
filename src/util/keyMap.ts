export class KeyMap<T extends { [k: string]: string }> {
  constructor(private map: T) {}
  getInternal(key: string | null | undefined) {
    if (key !== null && key !== undefined && key in this.map) {
      return this.map[key as keyof T];
    } else {
      return Object.values(this.map)[0] as T[string];
    }
  }
  getExternal(value: T[string]): keyof T {
    const keys = Object.keys(this.map) as (keyof T)[];
    if (value === undefined) {
      return keys[0];
    }
    const key = keys.find((key) => this.map[key as keyof typeof this.map] === value);
    return key ?? (keys[0] as keyof T);
  }
}
