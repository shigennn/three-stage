export interface Item { id: string; active: boolean; value: number }
export interface Frame { measuredAt: number; level: number; items: Item[] }
