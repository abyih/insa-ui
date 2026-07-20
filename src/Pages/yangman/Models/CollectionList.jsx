import { useState } from 'react';
import useBaseListModel from './baselist.model';
import useCollectionModel from './collection.model';

const useCollectionListModel = (ParsingJsonService, RequestsService) => {
    const {
        list,
        selectedItems,
        addFromJSON,
        addItemToList: baseAddItemToList,
        createItem,
        loadListFromStorage,
        saveToStorage,
        setName,
        selectAllFilteredItems,
        deselectAllFilteredItems,
        getSelectedItems,
        deselectAllItems
    } = useBaseListModel(ParsingJsonService);

    const [collections, setCollections] = useState([]);

    const collectionExists = (colName) => collections.some(col => col.name === colName);

    const getCollectionNames = () => collections.map(col => col.name);

    const getCollection = (colName) => collections.find(col => col.name === colName);

    const deleteCollection = (collObj) => {
        setCollections(prev => prev.filter(col => col.name !== collObj.name));
    };

    const duplicateCollection = (srcColName, destColName) => {
        const newCol = getCollection(srcColName).clone(destColName);
        setCollections(prev => [...prev, newCol]);
    };

    const renameCollection = (oldName, newName) => {
        setCollections(prev => prev.map(col => col.name === oldName ? { ...col, name: newName, data: col.data.map(item => ({ ...item, collection: newName })) } : col));
    };

    const toggleReqSelection = (onlyOneSelected, reqObj) => {
        setSelectedItems(prev => {
            if (onlyOneSelected) {
                return [reqObj];
            }
            return reqObj.selected ? prev.filter(item => item !== reqObj) : [...prev, reqObj];
        });
        reqObj.selected = !reqObj.selected;
    };

    const addItemToList = (reqObj) => {
        baseAddItemToList(reqObj);
        setCollections(prev => {
            let col = prev.find(col => col.name === reqObj.collection);
            if (!col) {
                col = useCollectionModel(reqObj.collection);
                return [...prev, { ...col, data: [...col.data, reqObj] }];
            }
            return prev.map(c => c.name === col.name ? { ...c, data: [...c.data, reqObj] } : c);
        });
    };

    const deleteRequestItem = (elem) => {
        setCollections(prev => prev.map(col => {
            if (col.name === elem.collection) {
                const newData = col.data.filter(item => item !== elem);
                return newData.length === 0 ? null : { ...col, data: newData };
            }
            return col;
        }).filter(Boolean));
    };

    const clear = () => {
        setCollections([]);
    };

    const toJSON = (collectionName) => {
        if (collectionName) {
            return getCollection(collectionName)?.data.map(elem => elem.toJSON());
        }
        return collections.flatMap(col => col.data.map(elem => elem.toJSON()));
    };

    const loadListFromFile = (data) => {
        if (data) {
            ParsingJsonService.parseJson(data).map(elem => RequestsService.createHistoryRequestFromElement(elem)).forEach(addItemToList);
        }
    };

    const getExpandedCollectionNames = () => collections.filter(col => col.expanded).map(col => col.name);

    const expandCollectionByNames = (expandCollectionNames) => {
        setCollections(prev => prev.map(col => ({ ...col, expanded: expandCollectionNames.includes(col.name) })));
    };

    return {
        collections,
        collectionExists,
        getCollectionNames,
        getCollection,
        deleteCollection,
        duplicateCollection,
        renameCollection,
        toggleReqSelection,
        addItemToList,
        deleteRequestItem,
        clear,
        toJSON,
        loadListFromFile,
        getExpandedCollectionNames,
        expandCollectionByNames
    };
};

export default useCollectionListModel;
