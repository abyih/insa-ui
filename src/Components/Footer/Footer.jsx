// import classes from "./footer.module.css";
import react from 'react';
import { FaFacebook, FaLinkedin, FaTwitter } from "react-icons/fa";
function Footer() {
	return (
		<footer className=" bottom-0 left-0 right-0 bg-blue-900 text-white  py-4">
      <div className="max-w-7xl px-6 ml-24 mt-4">
    <div className="flex flex-wrap justify-between gap-8">
      
    

      {/* Contact Us */}
      <div className="flex-[1_1_300px]">
  <h2 className="text-xl font-bold mb-4 underline underline-offset-4">Contact Us</h2>
  <ul className="space-y-2 text-gray-300">
    <li>
      <span className="font-medium text-white">Email:</span>{' '}
      <a href="mailto:contact@insa.gov.et" className="hover:text-white">
        contact@insa.gov.et
      </a>
    </li>
    <li>
      <span className="font-medium text-white">Phone:</span>{' '}
      <a href="tel:+251113717114" className="hover:text-white">
        +251-113--71-71-14
      </a>
    </li>
    <li>
      <span className="font-medium text-white">Address:</span>{' '}
      <a
        href="https://www.google.com/maps/place/Wello+Sefer,+Addis+Ababa,+Ethiopia"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-white"
      >
        Wello Sefer, Addis Ababa
      </a>
    </li>
  </ul>
</div>


      {/* Social Media */}
      <div className="flex-[1_1_200px]">
        <h2 className="text-xl font-bold mb-4 underline underline-offset-4">Follow Us</h2>
        <div className="flex space-x-6">
          <a href="https://web.facebook.com/INSA.ETHIOPIA" className="hover:scale-110 transition-transform"><FaFacebook className="text-2xl text-gray-300 hover:text-white" /></a>
          <a href="https://www.linkedin.com/in/insa-%E1%8A%A2%E1%88%98%E1%8B%B0%E1%8A%A0-649987269/?originalSubdomain=et" className="hover:scale-110 transition-transform"><FaLinkedin className="text-2xl text-gray-300 hover:text-blue-400" /></a>
          <a href="https://x.com/INSAEthio" className="hover:scale-110 transition-transform"><FaTwitter className="text-2xl text-gray-300 hover:text-blue-300" /></a>
        </div>
      </div>

    </div>
  </div>
 <hr className="my-8 border-t border-gray-400 border-solid" />
			<div className="max-w-7xl mx-auto px-8  flex justify-center 
      items-center text-white text-sm gap-8">
      <p>© {new Date().getFullYear()} PNTC Dashboard. All rights reserved.</p>
      <h1>Connected to ODL @ 10.0.1.2 | v1.3 | OK</h1>
    </div>




		
		</footer>
	);
}

export default Footer;
