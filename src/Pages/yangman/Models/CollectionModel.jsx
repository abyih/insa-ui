import { useState } from 'react';

const useCollectionModel = (name) => {
    const [collectionName, setCollectionName] = useState(name);
    const [expanded, setExpanded] = useState(false);
    const [data, setData] = useState([]);

    const clone = (newName) => {
        const newData = data.map(item => {
            const newItem = { ...item, collection: newName };
            if (item.clone) {
                return item.clone();
            }
            return newItem;
        });
        return useCollectionModel(newName, newData);
    };

    const toggleExpanded = () => {
        setExpanded(prev => !prev);
    };

    return {
        collectionName,
        expanded,
        data,
        setCollectionName,
        setData,
        clone,
        toggleExpanded,
    };
};

export default useCollectionModel;