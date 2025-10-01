declare module "html-to-image" {
  export function toPng(node: HTMLElement, options?: {
    cacheBust?: boolean;
    pixelRatio?: number;
    backgroundColor?: string;
  }): Promise<string>;
}
