export default function genEditorConfig() {
    const tpl = `
root=true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
trim_trailing_whitespace = true
insert_final_newline = true
charset = utf-8

[*.{json,md}]
indent_size = 2

[*.{js,ts}]
indent_size = 4

[Makefile]
indent_style = tab
indent_size = 4

`;

    return tpl;
}
