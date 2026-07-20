import { useState, useReducer } from "react";

// Helper function to round timestamp to the start of the day
const roundTimestampToDate = (timestamp) => {
  return timestamp - (timestamp % (24 * 60 * 60 * 1000));
};

// Reducer to manage history state
const historyReducer = (state, action) => {
  switch (action.type) {
    case "ADD_REQUEST": {
      const newRequest = action.payload;
      const newList = [...state.list, newRequest];
      const groupName = roundTimestampToDate(newRequest.timestamp);
      
      const updatedGroups = { ...state.dateGroups };
      if (!updatedGroups[groupName]) {
        updatedGroups[groupName] = {
          name: groupName,
          longName: new Date(groupName).toDateString(),
          requests: [],
        };
      }
      updatedGroups[groupName].requests.push(newRequest);
      
      return { ...state, list: newList, dateGroups: updatedGroups };
    }
    
    case "REMOVE_REQUEST": {
      const filteredList = state.list.filter((req) => req !== action.payload);
      return { ...state, list: filteredList };
    }
    
    case "CLEAR_HISTORY":
      return { list: [], dateGroups: {}, selectedItems: [] };
    
    case "TOGGLE_SELECTION": {
      const updatedList = state.list.map((req) =>
        req === action.payload ? { ...req, selected: !req.selected } : req
      );
      return {
        ...state,
        list: updatedList,
        selectedItems: updatedList.filter((req) => req.selected),
      };
    }
    
    case "SELECT_ALL":
      return {
        ...state,
        list: state.list.map((req) => ({ ...req, selected: true })),
        selectedItems: [...state.list],
      };
    
    case "DESELECT_ALL":
      return {
        ...state,
        list: state.list.map((req) => ({ ...req, selected: false })),
        selectedItems: [],
      };
    
    default:
      return state;
  }
};

export const useHistoryList = () => {
  const [settings, setSettings] = useState(null);
  const [state, dispatch] = useReducer(historyReducer, {
    list: [],
    dateGroups: {},
    selectedItems: [],
  });

  const addItemToList = (request) => {
    dispatch({ type: "ADD_REQUEST", payload: request });
  };

  const removeRequest = (request) => {
    dispatch({ type: "REMOVE_REQUEST", payload: request });
  };

  const clearHistory = () => {
    dispatch({ type: "CLEAR_HISTORY" });
  };

  const toggleRequestSelection = (request) => {
    dispatch({ type: "TOGGLE_SELECTION", payload: request });
  };

  const selectAllRequests = () => {
    dispatch({ type: "SELECT_ALL" });
  };

  const deselectAllRequests = () => {
    dispatch({ type: "DESELECT_ALL" });
  };

  const getNewestRequest = () => {
    return [...state.list].sort((a, b) => b.timestamp - a.timestamp)[0];
  };

  return {
    historyList: state.list,
    dateGroups: state.dateGroups,
    selectedItems: state.selectedItems,
    settings,
    setSettings,
    addItemToList,
    removeRequest,
    clearHistory,
    toggleRequestSelection,
    selectAllRequests,
    deselectAllRequests,
    getNewestRequest,
  };
};
