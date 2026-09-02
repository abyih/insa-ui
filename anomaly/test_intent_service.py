#!/usr/bin/env python3
"""
Automated unit test for anomaly/intent_service.py
"""
import unittest
import json
from intent_service import app

class TestLocalIntentService(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["model"], "all-MiniLM-L6-v2")

    def test_classify_urllc(self):
        res = self.client.post("/classify", json={
            "prompt": "Emergency tele-surgery robotic arm link with guaranteed low delay"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["sliceType"], "urllc")
        self.assertGreater(data["confidence"], 0.7)

    def test_classify_embb(self):
        res = self.client.post("/classify", json={
            "prompt": "4K 60fps live streaming pipeline for concert broadcast"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["sliceType"], "embb")

    def test_classify_mmtc(self):
        res = self.client.post("/classify", json={
            "prompt": "Smart meter water grid telemetry reporting readings every 15 minutes"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["sliceType"], "mmtc")

    def test_compile_full_pipeline(self):
        res = self.client.post("/compile", json={
            "prompt": "Allocate 25 Mbps high throughput video slice between 10.0.0.1 and 10.0.0.2",
            "networkContext": {
                "remainingCapacity": 100000,
                "onosHosts": [
                    {"ip": "10.0.0.1"},
                    {"ip": "10.0.0.2"}
                ]
            }
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["sliceType"], "embb")
        self.assertEqual(data["bandwidth"], 25000)
        self.assertEqual(data["targetHostIps"], ["10.0.0.1", "10.0.0.2"])
        self.assertEqual(data["admissionStatus"], "APPROVED")
        self.assertTrue(any("Meter" in act for act in data["openFlowActions"]))

if __name__ == "__main__":
    unittest.main()
