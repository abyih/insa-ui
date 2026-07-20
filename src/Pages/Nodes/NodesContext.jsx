// NodesContext.jsx
import { createContext, useState, useEffect } from "react";
import axios from "axios";
import ENV from "./env";

const baseURL = ENV.getBaseURL("MD_SAL");
console.log(`base url ${baseURL}`);

export const NodesContext = createContext();

export const NodesProvider = ({ children }) => {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        // const response = await axios.get(
        //   `${baseURL}/restconf/operational/opendaylight-inventory:nodes`
        // );
        const response = await axios.get('http://localhost:8181/restconf/operational/opendaylight-inventory:nodes', {
          mode: 'no-cors',
          headers: {
            'Authorization': 'Basic ' + btoa('admin:admin') // Replace with correct credentials if necessary
          }
        });
        

        console.log("API response:", response.data.nodes); // Log the response to inspect
        console.log(response.data.nodes.node.length );
        if (response.data.nodes && response.data.nodes.node.length > 0) {
          setNodes(response.data.nodes.node); // Set nodes directly from the response
        } else {
          setNodes([]); // Handle case where no nodes are returned
        }
      } catch (error) {
        console.error("Error fetching nodes:", error);
        setNodes([]); // Handle error gracefully
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();
  }, []); // Fetch nodes on initial load

  return (
    <NodesContext.Provider value={{ nodes, loading }}>
      {children}
    </NodesContext.Provider>
  );
};
