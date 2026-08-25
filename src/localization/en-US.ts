import { DEFAULT_MESSAGES, type ITranslations } from "@gooddata/sdk-ui";

export const customEnglishMessages: ITranslations = {
    ...DEFAULT_MESSAGES["en-US"],
    "visualization.emptyValue": "-",
};

export function installCustomEnglishMessages(): void {
    DEFAULT_MESSAGES["en-US"] = customEnglishMessages;
}
