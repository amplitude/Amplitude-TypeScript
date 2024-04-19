import { useNavigate } from 'react-router-dom';



function Contact() {
  const navigate = useNavigate();

  const navigateToContact = () => {

    const urlParams = new URLSearchParams({
      utm_source: 'from_contact_page'
    });
    navigate(`?${urlParams.toString()}`);
  };

  return (
   <>
   <div>Please file a bug in the <a href='https://github.com/amplitude/Amplitude-TypeScript'>github repo</a> if there has any issue.</div>
   <button onClick={navigateToContact}>append utm_source without refresh page</button>
   <button onClick={() => (window as any).amplitude.track('Button Click', { name: 'App' })}>TEST</button>
   </>
  );
}

export default Contact;
 