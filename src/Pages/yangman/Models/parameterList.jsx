import { useState } from "react";

const useParametersList = (initialName = "", ParametersService, ParsingJsonService) => {
  const [name, setName] = useState(initialName);
  const [list, setList] = useState([]);

  const addItemToList = (paramObj) => {
    setList((prevList) => [...prevList, paramObj]);
  };

  const deleteParameterItem = (paramObj) => {
    setList((prevList) => prevList.filter((item) => item !== paramObj));
  };

  const createItem = (element = { name: "", value: "" }) => {
    return ParametersService.createParameter(element);
  };

  const addEmptyItem = () => {
    addItemToList(createItem());
  };

  const removeEmptyParams = () => {
    setList((prevList) => prevList.filter((param) => param.name && param.name.length > 0));
  };

  const isNameUnique = (nameValue) => {
    return !nameValue || list.filter((item) => item.name === nameValue).length === 1;
  };

  const createParamsFromJson = (data) => {
    if (data) {
      clear();
      const parsedParams = ParsingJsonService.parseJson(data).map((elem) =>
        ParametersService.createParameter(elem)
      );
      setList(parsedParams);
    }
  };

  const toJSON = () => {
    return list.filter((item) => item.name).map((param) => param.toJSON());
  };

  const applyValsForFilters = () => {
    list.forEach((param) => param.applyValsForFilters());
  };

  const clone = () => {
    const clonedList = ParametersService.createEmptyParametersList(name);
    list.forEach((param) => {
      clonedList.addItemToList(param.clone());
    });
    return clonedList;
  };

  const clear = () => {
    setList([]);
  };

  return {
    name,
    setName,
    list,
    addItemToList,
    deleteParameterItem,
    createItem,
    addEmptyItem,
    removeEmptyParams,
    isNameUnique,
    createParamsFromJson,
    toJSON,
    applyValsForFilters,
    clone,
    clear,
  };
};

export default useParametersList;
