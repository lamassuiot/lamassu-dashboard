export const getDisplayDateFormat = (): string => {
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.DISPLAY_DATE_FORMAT) {
        return (window as any).lamassuConfig.DISPLAY_DATE_FORMAT;
    }
    return "dd/MM/yyyy HH:mm";
};

export const getDisplayDateAndTimeFormat = (): string => {
    if (typeof window !== 'undefined' && (window as any).lamassuConfig?.DISPLAY_DATE_AND_TIME_FORMAT) {
        return (window as any).lamassuConfig.DISPLAY_DATE_AND_TIME_FORMAT;
    }
    return "dd/MM/yyyy HH:mm:ss";
};
