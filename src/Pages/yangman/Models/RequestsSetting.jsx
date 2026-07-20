import { useState, useEffect } from "react";

const useRequestsSettings = (name, ParsingJsonService, RequestsSettingsService) => {
  const [data, setData] = useState({
    requestsCount: 10000,
    saveReceived: true,
    fillWithReceived: true,
    saveResponseData: true,
  });

  // Load settings from local storage on mount
  useEffect(() => {
    loadFromStorage();
  }, []);

  const setSettingsData = (newData) => {
    setData((prevData) => ({
      ...prevData,
      ...newData,
    }));
  };

  const clone = () => {
    return name === "yangman_historySettings"
      ? RequestsSettingsService.createHistorySettings()
      : RequestsSettingsService.createCollectionsSettings();
  };

  const loadFromStorage = () => {
    try {
      const settings = localStorage.getItem(name);
      if (settings) {
        setData(ParsingJsonService.parseJson(settings));
      }
    } catch (error) {
      console.error("Failed to load settings from storage:", error);
    }
  };

  const saveToStorage = () => {
    try {
      localStorage.setItem(name, JSON.stringify(data));
      console.debug("Saving settings:", data);
    } catch (error) {
      console.error("Failed to save settings to storage:", error);
    }
  };

  return {
    name,
    data,
    setSettingsData,
    loadFromStorage,
    saveToStorage,
    clone,
  };
};

export default useRequestsSettings;
