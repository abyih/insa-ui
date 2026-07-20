import requests
import time

ODL_BASE = "http://localhost:8181/rests/data"
ODL_AUTH = ("admin", "admin")
BLOCK_PRIORITY_SWITCH = 3000
BLOCK_COOKIE = 0xDEADBEEF
TABLE_ID = 0
FLOW_ID_PREFIX = "anomaly-block-"

# Session state
installed_rules = []

def block_switch(switch_id):
    """
    Installs a switch-wide drop rule on the given switch.
    
    Args:
        switch_id: str - Switch ID (e.g., "openflow:1")
    
    Returns:
        dict: Result with success flag and details
    """
    flow_id = FLOW_ID_PREFIX + switch_id + "-" + str(int(time.time()))
    
    # Build flow body
    flow_body = {
        "flow-node-inventory:flow": [{
            "id": flow_id,
            "table_id": TABLE_ID,
            "priority": BLOCK_PRIORITY_SWITCH,
            "cookie": BLOCK_COOKIE,
            "cookie_mask": "0xFFFFFFFFFFFFFFFF",
            "idle-timeout": 0,
            "hard-timeout": 0,
            "match": {},  # empty match = matches ALL traffic
            "instructions": {
                "instruction": [{
                    "order": 0,
                    "apply-actions": {
                        "action": [{
                            "order": 0,
                            "drop-action": {}
                        }]
                    }
                }]
            }
        }]
    }
    
    url = (ODL_BASE + "/opendaylight-inventory:nodes/node=" + switch_id +
           "/flow-node-inventory:table=" + str(TABLE_ID) +
           "/flow=" + flow_id)
    
    try:
        response = requests.put(
            url,
            json=flow_body,
            auth=ODL_AUTH,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code in (200, 201):
            rule = {
                "switch_id": switch_id,
                "flow_id": flow_id,
                "table_id": TABLE_ID,
                "installed_at": time.time(),
                "action_type": "switch_wide",
                "priority": BLOCK_PRIORITY_SWITCH
            }
            installed_rules.append(rule)
            
            return {
                "success": True,
                "switch_id": switch_id,
                "flow_id": flow_id,
                "priority": BLOCK_PRIORITY_SWITCH,
                "action": "switch_wide"
            }
        else:
            return {
                "success": False,
                "error": f"ODL returned {response.status_code}: {response.text}"
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def rollback_session():
    """
    Removes all rules installed during this session.
    
    Returns:
        dict: Result with count and individual removal results
    """
    results = []
    
    for rule in installed_rules[:]:  # Iterate over copy
        url = (ODL_BASE + "/opendaylight-inventory:nodes/node=" + rule["switch_id"] +
               "/flow-node-inventory:table=" + str(rule["table_id"]) +
               "/flow=" + rule["flow_id"])
        
        try:
            response = requests.delete(url, auth=ODL_AUTH)
            success = response.status_code in (200, 204)
            results.append({
                "switch_id": rule["switch_id"],
                "flow_id": rule["flow_id"],
                "success": success
            })
        except Exception as e:
            results.append({
                "switch_id": rule["switch_id"],
                "flow_id": rule["flow_id"],
                "success": False,
                "error": str(e)
            })
    
    # Clear the session rules
    installed_rules.clear()
    
    return {
        "removed": len(results),
        "results": results
    }

def get_session_rules():
    """
    Returns copy of installed_rules list.
    
    Returns:
        list: Copy of installed_rules list
    """
    return installed_rules.copy()