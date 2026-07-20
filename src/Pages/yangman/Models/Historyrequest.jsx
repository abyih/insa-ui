import { useState } from "react";

const useHistoryRequestModel = () => {
    const [request, setRequest] = useState({
        collection: "",
        method: "",
        name: "",
        path: "",
        receivedData: null,
        selected: false,
        sentData: null,
        status: "",
        timestamp: "",
        responseStatus: "",
        responseStatusText: "",
        responseTime: ""
    });

    const setData = (sentData, receivedData, status, path, operation, name, collection, timestamp, responseStatus, responseStatusText, responseTime) => {
        setRequest(prev => ({
            ...prev,
            sentData: sentData || null,
            receivedData: receivedData || null,
            status: status || "",
            path,
            method: operation,
            name,
            collection,
            timestamp,
            responseStatus,
            responseStatusText,
            responseTime
        }));
    };

    const setExecutionData = (sentData, receivedData, status, responseStatus, responseStatusText, responseTime) => {
        setRequest(prev => ({
            ...prev,
            sentData,
            receivedData,
            status: status ? (status > 199 && status < 205 ? "success" : "error") : "",
            responseStatus,
            responseStatusText,
            responseTime
        }));
    };

    const toJSON = () => {
        return { ...request };
    };

    const getLastPathDataElemName = () => {
        const pathArray = request.path.split(":");
        return pathArray[pathArray.length - 1];
    };

    const clone = () => {
        return { ...request };
    };

    return {
        request,
        setData,
        setExecutionData,
        toJSON,
        getLastPathDataElemName,
        clone
    };
};

export default useHistoryRequestModel;
