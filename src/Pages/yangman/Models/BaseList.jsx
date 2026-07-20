import { useState, useEffect } from 'react';

const useBaseListModel = (name, ParsingJsonService) => {
    const [list, setList] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);

    const deselectAllItems = () => {
        setList(prevList => prevList.map(item => ({ ...item, selected: false })));
        setSelectedItems([]);
    };

    const getSelectedItems = (filterFunc) => {
        return filterFunc ? selectedItems.filter(filterFunc) : selectedItems;
    };

    const selectAllFilteredItems = (filterFunc) => {
        setList(prevList => prevList.map(item => {
            if (filterFunc(item)) {
                if (!selectedItems.includes(item)) {
                    setSelectedItems(prev => [...prev, item]);
                }
                return { ...item, selected: true };
            }
            return item;
        }));
    };

    const deselectAllFilteredItems = (filterFunc) => {
        setList(prevList => prevList.map(item => {
            if (filterFunc(item)) {
                setSelectedItems(prev => prev.filter(selected => selected !== item));
                return { ...item, selected: false };
            }
            return item;
        }));
    };

    const createItem = (elem) => elem;

    const addItemToList = (item) => {
        setList(prevList => [...prevList, item]);
    };

    const loadListFromStorage = () => {
        const storageList = localStorage.getItem(name);
        if (storageList) {
            setList([]);
            const parsedList = ParsingJsonService.parseJson(storageList).map(createItem);
            setList(parsedList);
        }
    };

    const saveToStorage = () => {
        try {
            localStorage.setItem(name, JSON.stringify(list));
        } catch (e) {
            console.error("Error saving to local storage", e);
        }
    };

    const addFromJSON = (json) => {
        const items = json.map(createItem);
        setList(prevList => [...prevList, ...items]);
    };

    useEffect(() => {
        loadListFromStorage();
    }, []);

    return {
        list,
        selectedItems,
        deselectAllItems,
        getSelectedItems,
        selectAllFilteredItems,
        deselectAllFilteredItems,
        createItem,
        addItemToList,
        loadListFromStorage,
        saveToStorage,
        addFromJSON,
    };
};

export default useBaseListModel;
