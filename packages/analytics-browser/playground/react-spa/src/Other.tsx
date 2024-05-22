function Other() {
  return (
    <div>
    <h1>Test other functions here</h1>
    <button onClick={() => (window as any).amplitude.identify(new (window as any).amplitude.Identify().set('role', 'engineer'))}>
        Identify
    </button>
    <button onClick={() => (window as any).amplitude.setGroup('org', 'engineering')}>
        Group
    </button>
    <button onClick={() => (window as any).amplitude.groupIdentify('org', 'engineering', new (window as any).amplitude.Identify().set('technology', 'react.js'))}>
          Group Identify
    </button>
    </div>

  );
}

export default Other;
