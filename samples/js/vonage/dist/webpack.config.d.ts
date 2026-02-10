export let entry: string[];
export let mode: string;
export namespace module {
    let rules: {
        test: RegExp;
        use: string;
        exclude: RegExp;
    }[];
}
export namespace resolve {
    let extensions: string[];
}
export namespace output {
    let path: string;
    let filename: string;
}
//# sourceMappingURL=webpack.config.d.ts.map