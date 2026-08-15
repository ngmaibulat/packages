//Expo's own template references icon.png, splash-icon.png and three android
//adaptive-icon layers here. All of them are binary, and this scaffolder only
//writes text, so those keys are omitted entirely - expo falls back to its
//built-in defaults. Add "icon": "./assets/icon.png" once you have artwork.
export default function genAppJson(name: string) {
    //the slug ends up in urls, and validateName allows spaces and capitals
    //that expo does not - so fold them out, falling back to the raw name if
    //nothing usable survives
    const slug =
        name
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "") || name;

    const tpl = `
{
    "expo": {
        "name": "${name}",
        "slug": "${slug}",
        "version": "1.0.0",
        "orientation": "portrait",
        "userInterfaceStyle": "light",
        "ios": {
            "supportsTablet": true
        },
        "android": {
            "predictiveBackGestureEnabled": false
        }
    }
}
`;

    return tpl;
}
