import { useState } from "react";

const useParameter = (initialName = "", initialValue = "") => {
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState(initialValue);
  const [_name, set_Name] = useState(initialName);
  const [_value, set_Value] = useState(initialValue);

  const applyValsForFilters = () => {
    set_Name(name);
    set_Value(value);
  };

  const setData = (newName, newValue) => {
    setName(newName);
    setValue(newValue);
    set_Name(newName);
    set_Value(newValue);
  };

  const toJSON = () => ({
    name,
    value,
  });

  const clone = () => useParameter(name, value);

  return {
    name,
    value,
    setName,
    setValue,
    applyValsForFilters,
    setData,
    toJSON,
    clone,
  };
};

export default useParameter;
